const { ipcRenderer, clipboard } = require('electron');

const els = {
    source: document.getElementById('sourceDir'),
    target: document.getElementById('targetDir'), font: document.getElementById('fontPath'),
    fileNameFormat: document.getElementById('fileNameFormat'),
    fsR: document.getElementById('fsR'), fsN: document.getElementById('fsN'),
    mgR: document.getElementById('mgR'), mgN: document.getElementById('mgN'),
    w: document.getElementById('resW'), h: document.getElementById('resH'),
    btnStart: document.getElementById('btnStart'), btnStop: document.getElementById('btnStop'),
    logBody: document.getElementById('logBody'), logTable: document.getElementById('logTable')
};

const prog = {
    // 전체 진행률 요소 (기존)
    bar: document.getElementById('progBar'),
    text: document.getElementById('progText'),
    percent: document.getElementById('progPercent'),
    total: document.getElementById('totalCount'),
    done: document.getElementById('doneCount'),
    wait: document.getElementById('waitCount'),
    // 파일 진행률 요소 (신규)
    fileBar: document.getElementById('fileProgBar'),
    fileText: document.getElementById('fileProgText'),
    filePercent: document.getElementById('fileProgPercent')
};

let logCount = 0; // 순번 카운트 변수

// 동기화
els.fsR.oninput = () => els.fsN.value = els.fsR.value;
els.fsN.oninput = () => els.fsR.value = els.fsN.value;
els.mgR.oninput = () => els.mgN.value = els.mgR.value;
els.mgN.oninput = () => els.mgR.value = els.mgN.value;
els.fileNameFormat.oninput = () => {
    // 윈도우 파일명 금지 문자: < > : " / \ | ? *
    els.fileNameFormat.value = els.fileNameFormat.value.replace(/[<>:"/\\|?*]/g, '');
};

let currentFileName = ""; // 현재 변환 중인 파일명 기억용

window.onload = async () => {
    const c = await ipcRenderer.invoke('load-config');
    if (c) {
        if (c.source) els.source.value = c.source; 
        if (c.target) els.target.value = c.target; 
        if (c.font) els.font.value = c.font;
        els.fsN.value = els.fsR.value = c.fontSize || 22;
        els.mgN.value = els.mgR.value = c.margins || 20;
        els.fileNameFormat.value = c.fileNameFormat || "{name}.{ext}.xtc";
    }
};

document.getElementById('btnSource').onclick = async () => els.source.value = await ipcRenderer.invoke('select-dir') || els.source.value;
document.getElementById('btnTarget').onclick = async () => els.target.value = await ipcRenderer.invoke('select-dir') || els.target.value;
document.getElementById('btnFont').onclick = async () => els.font.value = await ipcRenderer.invoke('select-file') || els.font.value;

els.btnStart.onclick = () => {
    if (!els.source.value || !els.target.value) return alert("원본 및 저장 폴더를 지정해주세요.");
    
    const settings = {
        source: els.source.value, 
        target: els.target.value,
        font: els.font.value, 
        fontSize: els.fsN.value, 
        margins: els.mgN.value, 
        w: els.w.value, 
        h: els.h.value,
        lineHeight: els.lineHeightNum ? els.lineHeightNum.value : 140,
        fileNameFormat: els.fileNameFormat.value || "{name}.{ext}.xtc"
    };
    
    // 1. 버튼 상태 즉시 변경 (중복 클릭 원천 봉쇄)
    els.btnStart.disabled = true; 
    els.btnStart.innerText = "변환 진행 중...";
    els.btnStart.style.backgroundColor = "#999";

    // 2. 중지 버튼 활성화
    els.btnStop.disabled = false;
    
    logCount = 0; // 시작할 때 카운트 초기화
    els.logBody.innerHTML = ""; // 로그 초기화
    
    ipcRenderer.send('save-config', settings);
    ipcRenderer.send('start-conversion', settings);
};

els.btnStop.onclick = () => {
    // 1. 중지 버튼 즉시 비활성화 (여러 번 누르지 못하게)
    els.btnStop.disabled = true;
    els.btnStop.innerText = "중지 명령 전달 중...";

    // 2. 메인 프로세스에 중단 신호 전달
    ipcRenderer.send('stop-conversion');
    
    // UI에 로그 남기기
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="8" style="text-align:center; color:orange; font-weight:bold;">사용자에 의해 중지 요청됨...</td>`;
    els.logBody.appendChild(tr);
};

ipcRenderer.on('log-entry', (e, log) => {
    logCount++; // 파일 하나 끝날 때마다 번호 증가

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="text-align:center;">${logCount}</td> <td>${log.name}</td>
        <td style="text-align:center;">${log.origExt}</td>
        <td style="text-align:center; display:none;">${log.convExt}</td>
        <td style="text-align:right;">${log.origSize}</td>
        <td style="text-align:right;">${log.convSize}</td>
        <td style="color: ${log.status === '성공' ? 'green' : 'red'}; font-weight:bold; text-align:center;">${log.status}</td>
        <td>${log.msg}</td>
    `;
    els.logBody.appendChild(tr);
});

// 우클릭 복사
els.logTable.oncontextmenu = (e) => {
    e.preventDefault();
    let txt = "No.\t파일명\t원본확장자\t변환확장자\t원본크기\t변환크기\t상태\t메세지\n";
    Array.from(els.logBody.rows).forEach(r => {
        txt += Array.from(r.cells).map(c => c.innerText).join('\t') + '\n';
    });
    clipboard.writeText(txt);
    alert("복사되었습니다.");
};

// 진행률 업데이트 수신
ipcRenderer.on('update-progress', (e, data) => {
    const { total, done, currentFile } = data;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    
    prog.total.innerText = total;
    prog.done.innerText = done;
    prog.wait.innerText = total - done;
    prog.percent.innerText = percent + "%";
    prog.bar.style.width = percent + "%";
    
    currentFileName = currentFile;
    prog.text.innerText = `전체 진행 중...`;
    
    // 새 파일을 시작할 때 개별 파일 진행 바 초기화
    prog.fileText.innerText = `현재 파일: ${currentFileName} (변환 엔진 준비 중...)`;
    prog.filePercent.innerText = "0%";
    prog.fileBar.style.width = "0%";
});

// 🔥 엔진 실시간 로그(페이지 등) 수신
ipcRenderer.on('engine-stream', (e, data) => {
    const { file, text } = data; // main.js에서 보낸 객체 분해
    currentFileName = file;      // 현재 파일명 강제 업데이트
    
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        
        // 정규식으로 "숫자/숫자" 형태 파싱 (예: 12/50, 12 / 50 등)
        const match = lastLine.match(/(\d+)\s*\/\s*(\d+)/);
        if (match) {
            const current = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            
            if (total > 0) {
                const percent = Math.round((current / total) * 100);
                prog.filePercent.innerText = percent + "%";
                prog.fileBar.style.width = percent + "%";
                prog.fileText.innerText = `현재 파일: ${file} [${current} / ${total} 페이지]`;
            }
        } else {
            // 숫자가 잡히지 않는 일반 로그
            prog.fileText.innerText = `현재 파일: ${file} [${lastLine}]`;
        }
    }
});

// 작업 완료 시 UI 정리
ipcRenderer.on('conversion-done', (e, stopped) => {
    els.btnStart.disabled = false; 
    els.btnStart.innerText = "변환 시작";
    els.btnStart.style.backgroundColor = "#4CAF50"; 
    
    els.btnStop.disabled = true;
    els.btnStop.innerText = "중지";
    
    prog.text.innerText = stopped ? "작업 중지됨" : "모든 작업 완료";
    prog.fileText.innerText = stopped ? "엔진 정지됨" : "대기 중...";
    prog.filePercent.innerText = stopped ? prog.filePercent.innerText : "100%";
    if (!stopped) prog.fileBar.style.width = "100%";

    alert(stopped ? "중지되었습니다." : "모든 변환 작업이 완료되었습니다.");
});
