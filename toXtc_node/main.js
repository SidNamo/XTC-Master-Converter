const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const { pdfToPng } = require('pdf-to-png-converter');

app.disableHardwareAcceleration();

let mainWindow;

/**
 * [수정] 빌드된 포터블 EXE와 같은 위치를 찾기 위한 경로 로직
 */
const isPackaged = app.isPackaged;
let basePath;

if (isPackaged) {
    // 빌드된 경우: 포터블 EXE 위치 혹은 실행파일 위치
    basePath = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
} else {
    // 개발 모드(npm run start): 현재 프로젝트의 루트 폴더
    basePath = __dirname;
}

// 개발 모드일 때 Electron이 엉뚱한 곳(node_modules)에 캐시를 쌓지 않도록 설정
if (!isPackaged) {
    app.setPath('userData', path.join(basePath, '.cache'));
}

const configPath = path.join(basePath, 'config.json');
const tempBaseDir = path.join(basePath, 'temp');

let isCancelled = false;
let totalTasks = 0;
let doneTasks = 0;

/**
 * 전용 temp 폴더 초기화 및 삭제
 */
function initTemp() { if (!fs.existsSync(tempBaseDir)) fs.mkdirSync(tempBaseDir, { recursive: true }); }
function cleanupTemp() { if (fs.existsSync(tempBaseDir)) fs.rmSync(tempBaseDir, { recursive: true, force: true }); }

/**
 * 유틸리티: 파일 크기 포맷
 */
function formatSize(b) {
    if (!b || b === 0) return '0 B';
    const k = 1024, i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}

/**
 * 유틸리티: 상세 로그 기록 (basePath 기준)
 */
function writeDetailedLog(status, name, msg, stdout = "", stderr = "") {
    const logsDir = path.join(basePath, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    
    const now = new Date();
    const fileName = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.log`;
    let logContent = `[${now.toLocaleTimeString()}] [${status}] ${name} | ${msg}\n`;
    if (stdout) logContent += `  - STDOUT: ${stdout.trim()}\n`;
    if (stderr) logContent += `  - STDERR: ${stderr.trim()}\n`;
    fs.appendFileSync(path.join(logsDir, fileName), logContent + "------------------------------------------\n", 'utf8');
}

/**
 * [수정] 파일명 포맷 치환 함수 (날짜 태그 및 점 제외 확장자 적용)
 */
function getFormattedFileName(format, name, ext, fileNameFormat) {
    const now = new Date();
    const d = {
        yyyy: now.getFullYear(),
        mm: String(now.getMonth() + 1).padStart(2, '0'),
        dd: String(now.getDate()).padStart(2, '0'),
        hh: String(now.getHours()).padStart(2, '0'),
        mi: String(now.getMinutes()).padStart(2, '0'),
        ss: String(now.getSeconds()).padStart(2, '0')
    };

    // 확장자에서 첫 번째 점(.) 제거 (예: .txt -> txt)
    const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;

    let result = fileNameFormat || "{name}.{ext}.xtc";
    result = result.replace(/{name}/g, name)
                   .replace(/{ext}/g, cleanExt)
                   .replace(/{yyyy}/g, d.yyyy)
                   .replace(/{mm}/g, d.mm)
                   .replace(/{dd}/g, d.dd)
                   .replace(/{hh}/g, d.hh)
                   .replace(/{mi}/g, d.mi)
                   .replace(/{ss}/g, d.ss);
    
    return result;
}

/**
 * [수정] 전체 작업 개수 미리 계산 - ZIP 내부의 ZIP까지 재귀적으로 탐색
 */
async function countTasks(srcPath) {
    let count = 0;
    if (!fs.existsSync(srcPath)) return 0;
    const items = fs.readdirSync(srcPath);
    let hasImages = false;

    for (const it of items) {
        const p = path.join(srcPath, it);
        const st = fs.statSync(p);
        const ex = path.extname(it).toLowerCase();

        if (st.isDirectory()) {
            count += await countTasks(p);
        } else if (ex === '.zip') {
            try {
                const zipBuffer = fs.readFileSync(p);
                count += await countTasksInZip(zipBuffer);
            } catch (e) { count++; }
        } else if (['.png', '.jpg', '.jpeg', '.gif'].includes(ex)) {
            hasImages = true;
        } else if (['.txt', '.pdf', '.epub'].includes(ex)) {
            count++;
        }
    }
    if (hasImages) count++;
    return count;
}

async function countTasksInZip(zipBuffer) {
    let zipCount = 0;
    let zipHasImages = false;
    try {
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();
        for (const e of entries) {
            if (e.isDirectory) continue;
            const zEx = path.extname(e.entryName).toLowerCase();
            if (zEx === '.zip') {
                zipCount += await countTasksInZip(e.getData());
            } else if (['.txt', '.pdf', '.epub'].includes(zEx)) {
                zipCount++;
            } else if (['.png', '.jpg', '.jpeg', '.gif'].includes(zEx)) {
                zipHasImages = true;
            }
        }
    } catch (err) { return 1; }
    if (zipHasImages) zipCount++;
    return zipCount;
}

/**
 * [추가] 중복 파일명 방지 함수 (윈도우 스타일 넘버링)
 * - (1) (1) 이중 생성 방지 및 빈 번호 채우기
 */
function getUniqueFilePath(dir, name, ext) {
    let finalPath = path.join(dir, `${name}${ext}`);
    if (!fs.existsSync(finalPath)) return finalPath;

    // 이미 "이름 (숫자)" 형태인지 확인하는 정규식
    // 예: "제목1 (1)" -> match[1]="제목1", match[2]="1"
    const match = name.match(/^(.*?)(?:\s*\((\d+)\))?$/);
    const base = match[1] || name;
    let counter = match[2] ? parseInt(match[2], 10) : 1;

    // 1부터 순서대로 숫자를 올리면서 빈 자리가 있는지 탐색
    while (true) {
        finalPath = path.join(dir, `${base} (${counter})${ext}`);
        if (!fs.existsSync(finalPath)) {
            return finalPath; // 겹치지 않는 파일명을 찾으면 즉시 반환
        }
        counter++;
    }
}

/**
 * EPUB 생성 함수
 */
function createEpub(files, epubPath, title, type = 'text', settings = {}) {
    const zip = new AdmZip();
    zip.addFile("mimetype", Buffer.from("application/epub+zip", "utf8"));
    zip.addFile("META-INF/container.xml", Buffer.from('<?xml version="1.0" encoding="utf-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>', "utf8"));
    
    const css = `
        body { 
            text-align: left !important; 
            word-break: break-all; 
            line-height: ${settings.lineHeight || 140}%; 
            margin: 0; 
            padding: 0;
        }
        p { margin: 0; padding: 0; text-indent: 0; text-align: left !important; }
    `;
    zip.addFile("OEBPS/style.css", Buffer.from(css, "utf8"));

    let manifest = "", spine = "";
    files.forEach((f, i) => {
        const ext = path.extname(f.name || '.png').toLowerCase();
        const ih = `i${i}${ext}`, hh = `p${i}.html`;
        
        if (type === 'image') {
            zip.addFile(`OEBPS/${ih}`, f.data);
            const imgHtml = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html><head><meta charset="utf-8"/><link rel="stylesheet" type="text/css" href="style.css"/></head><body style="text-align:center;"><img src="${ih}" style="width:100%;"/></body></html>`;
            zip.addFile(`OEBPS/${hh}`, Buffer.from(imgHtml, "utf8"));
            manifest += `<item id="img${i}" href="${ih}" media-type="image/${ext==='.png'?'png':'jpeg'}"/><item id="p${i}" href="${hh}" media-type="application/xhtml+xml"/>`;
            spine += `<itemref idref="p${i}"/>`;
        } else {
            const txtHtml = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${f.content}</body></html>`;
            zip.addFile(`OEBPS/${hh}`, Buffer.from(txtHtml, "utf8"));
            manifest += `<item id="p${i}" href="${hh}" media-type="application/xhtml+xml"/>`;
            spine += `<itemref idref="p${i}"/>`;
        }
    });
    manifest += `<item id="css" href="style.css" media-type="text/css"/>`;
    zip.addFile("OEBPS/content.opf", Buffer.from(`<?xml version="1.0" encoding="utf-8"?><package version="2.0" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`, "utf8"));
    zip.writeZip(epubPath);
}

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({ width: 1100, height: 1100, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    mainWindow.loadFile('index.html');
});

ipcMain.handle('select-dir', async () => (await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })).filePaths[0]);
ipcMain.handle('select-file', async () => (await dialog.showOpenDialog(mainWindow, { filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }] })).filePaths[0]);
ipcMain.handle('load-config', () => fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath)) : null);
ipcMain.on('save-config', (e, c) => fs.writeFileSync(configPath, JSON.stringify(c)));
ipcMain.on('stop-conversion', () => isCancelled = true);

ipcMain.on('start-conversion', async (event, settings) => {
    isCancelled = false; initTemp();
    
    totalTasks = await countTasks(settings.source);
    doneTasks = 0;

    const notifyUI = (n, oe, os, cs, st, msg) => {
        doneTasks++;
        mainWindow.webContents.send('log-entry', { name: n, origExt: oe, convExt: 'xtc', origSize: formatSize(os), convSize: formatSize(cs), status: st, msg: msg });
        mainWindow.webContents.send('update-progress', { total: totalTasks, done: doneTasks, currentFile: n });
        writeDetailedLog(st === '성공' ? 'SUCCESS' : 'FAILED', n, `[${oe} -> xtc] ${msg} (크기: ${formatSize(os)} -> ${formatSize(cs)})`);
    };

    const runEngine = async (ep, op, originalName) => {
        const ed = isPackaged 
            ? path.join(process.resourcesPath, 'epub-to-xtc-converter') 
            : path.join(__dirname, 'epub-to-xtc-converter');

        let cliEntry = path.join(ed, 'cli', 'index.js');
        if (!fs.existsSync(cliEntry)) cliEntry = path.join(ed, 'index.js');

        const m = parseInt(settings.margins || 20);
        const cfg = { 
            "device":"custom", "width":parseInt(settings.w), "height":parseInt(settings.h), 
            "font":{"path":settings.font, "size":parseInt(settings.fontSize), "weight":400}, 
            "margins":{"left":m,"top":m,"right":m,"bottom":m}, 
            "lineHeight":parseInt(settings.lineHeight || 140), "textAlign":"left", 
            "output":{"format":"xtc","dithering":true} 
        };
        const cp = path.join(tempBaseDir, `cfg_${Date.now()}.json`);
        fs.writeFileSync(cp, JSON.stringify(cfg));
        const tx = ep.replace('.epub', '.xtc');
        
        // 🔥 핵심 변경: Commander.js의 Electron 감지 버그를 속이는 임시 래퍼 스크립트 생성
        const wrapperPath = path.join(tempBaseDir, `wrap_${Date.now()}.js`);
        fs.writeFileSync(wrapperPath, `
            // Electron 환경 변수를 지워서 commander가 일반 Node로 착각하게 만듭니다.
            delete process.versions.electron;
            require(${JSON.stringify(cliEntry)});
        `);

        try {
            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                
                // cliEntry 대신 wrapperPath를 먼저 실행합니다.
                const child = spawn(process.execPath, [wrapperPath, 'convert', ep, tx, '-c', cp], { 
                    cwd: ed, 
                    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } 
                });
                
                let stdoutLog = "", stderrLog = "";

                child.stdout.on('data', (data) => {
                    const str = data.toString();
                    stdoutLog += str;
                    mainWindow.webContents.send('engine-stream', { file: originalName, text: str });
                });

                child.stderr.on('data', (data) => {
                    const str = data.toString();
                    stderrLog += str;
                    mainWindow.webContents.send('engine-stream', { file: originalName, text: str }); 
                });

                child.on('close', (code) => {
                    if (code === 0 && fs.existsSync(tx)) resolve(true);
                    else reject(new Error(stderrLog || stdoutLog || "엔진 변환 실패"));
                });
                
                child.on('error', reject);
            });

            if (fs.existsSync(tx)) {
                const targetDir = path.dirname(op);
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

                try { fs.renameSync(tx, op); } 
                catch(e) { if(e.code==='EXDEV') { fs.copyFileSync(tx, op); fs.unlinkSync(tx); } else throw e; }
                return true;
            }
            return false;
        } catch (e) {
            writeDetailedLog("ENGINE-ERROR", originalName, e.message);
            throw e;
        } finally { 
            if(fs.existsSync(cp)) fs.unlinkSync(cp); 
            // 다 쓴 래퍼 스크립트 청소
            if(fs.existsSync(wrapperPath)) fs.unlinkSync(wrapperPath); 
        }
    };

    const processItem = async (fp, td) => {
        if (isCancelled) return;
        const ext = path.extname(fp).toLowerCase();
        const no = path.parse(fp).name;
        const os = fs.statSync(fp).size;
        
        // [수정] 설정된 파일명 포맷 적용
        const outName = getFormattedFileName(settings.fileNameFormat, no, ext, settings.fileNameFormat);
        const parsedOut = path.parse(outName); // 확장자와 이름을 분리
        const xtcPath = getUniqueFilePath(td, parsedOut.name, parsedOut.ext); // 중복 검사 거치기
        const ep = path.join(tempBaseDir, `t_${Date.now()}.epub`);
        
        try {
            if (ext === '.txt') {
                const r = fs.readFileSync(fp), d = jschardet.detect(r);
                const t = iconv.decode(r, d.confidence > 0.8 ? d.encoding : 'cp949');
                const htmlBody = t.split('\n').map(l => {
                    const line = l.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    return line ? `<p>${line}</p>` : `<p>&nbsp;</p>`;
                }).join('');
                createEpub([{ content: htmlBody, name:'c.html' }], ep, no, 'text', settings);
            } else if (ext === '.pdf') {
                const p = await pdfToPng(fp, { disableFontFace: true });
                createEpub(p.map((x, i)=>({ name:`p${i}.png`, data:x.content })), ep, no, 'image', settings);
            } else if (ext === '.epub') fs.copyFileSync(fp, ep);
            else return;

            const ok = await runEngine(ep, xtcPath, no);
            const cs = ok && fs.existsSync(xtcPath) ? fs.statSync(xtcPath).size : 0;
            if (cs === 0) throw new Error("결과 파일 크기가 0 B입니다.");
            notifyUI(no, ext, os, cs, '성공', '변환 완료');
        } catch (e) { 
            notifyUI(no, ext, os, 0, '실패', e.message); 
            writeDetailedLog("FAILED", no, e.message);
        } finally { if(fs.existsSync(ep)) fs.unlinkSync(ep); }
    };

    const scan = async (currentSrc, currentTgt, isFromZip = false, zipName = "") => {
        if (isCancelled) return;
        if (!fs.existsSync(currentTgt)) fs.mkdirSync(currentTgt, { recursive: true });

        const its = fs.readdirSync(currentSrc), imgs = [];
        for (const it of its) {
            if (isCancelled) break;
            const p = path.join(currentSrc, it), st = fs.statSync(p), ex = path.extname(it).toLowerCase();
            
            if (st.isDirectory()) {
                await scan(p, path.join(currentTgt, it));
            } else if (ex === '.zip') {
                const zd = path.join(tempBaseDir, `z_${Date.now()}`); fs.mkdirSync(zd);
                const zip = new AdmZip(p);
                zip.getEntries().forEach(e => {
                    const dn = iconv.decode(e.rawEntryName, jschardet.detect(e.rawEntryName).encoding?.includes('utf') ? 'utf8' : 'cp949');
                    const tp = path.join(zd, dn);
                    if(e.isDirectory) fs.mkdirSync(tp, {recursive:true});
                    else { fs.mkdirSync(path.dirname(tp), {recursive:true}); fs.writeFileSync(tp, e.getData()); }
                });
                await scan(zd, path.join(currentTgt, it), true, it);
            } else if (['.png','.jpg','.jpeg','.gif'].includes(ex)) {
                imgs.push({ path:p, name:it, data:fs.readFileSync(p), size:st.size });
            } else if (['.txt','.pdf','.epub'].includes(ex)) {
                await processItem(p, currentTgt);
            }
        }

        if (!isCancelled && imgs.length > 0) {
            const bn = isFromZip ? zipName : path.basename(currentSrc);
            const no = isFromZip ? path.parse(zipName).name : bn;
            const ext = isFromZip ? 'zip' : 'folder';

            // [수정] 이미지 병합 파일명 포맷 적용
            const outName = getFormattedFileName(settings.fileNameFormat, no, ext, settings.fileNameFormat);
            const parsedOut = path.parse(outName); // 확장자와 이름을 분리
            const xtcPath = getUniqueFilePath(currentTgt, parsedOut.name, parsedOut.ext); // 중복 검사 거치기
            const ep = path.join(tempBaseDir, `g_${Date.now()}.epub`), ts = imgs.reduce((a,b)=>a+b.size, 0);
            
            try {
                createEpub(imgs.sort((a,b)=>a.name.localeCompare(b.name, undefined, {numeric:true})), ep, no, 'image', settings);
                const ok = await runEngine(ep, xtcPath, no);
                const cs = ok && fs.existsSync(xtcPath) ? fs.statSync(xtcPath).size : 0;
                if (ok) notifyUI(no, isFromZip ? '.zip' : 'folder', ts, cs, '성공', '이미지 병합 완료');
            } catch (e) { notifyUI(no, 'img', ts, 0, '실패', e.message); }
            finally { if(fs.existsSync(ep)) fs.unlinkSync(ep); }
        }
    };

    try { 
        mainWindow.webContents.send('update-progress', { total: totalTasks, done: 0, currentFile: "준비 중..." });
        await scan(settings.source, settings.target); 
    } finally { 
        cleanupTemp(); 
        mainWindow.webContents.send('conversion-done', isCancelled); 
        isCancelled = false;
    }
});
