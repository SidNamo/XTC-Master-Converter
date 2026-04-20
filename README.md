# 🚀 XTC Master Converter

## 📌 소개

**XTC Master Converter**는 다양한 문서 및 이미지 파일을 전자책 단말기 전용 포맷인 **`.xtc`**로 일괄 변환해주는 GUI 기반 변환 도구입니다.

핵심 변환 엔진으로 오픈소스 프로젝트 **epub-to-xtc-converter**를 활용합니다.

👉 엔진 레포지토리:  
https://github.com/bigbag/epub-to-xtc-converter

---

## ✨ 주요 기능

- 📄 다양한 포맷 지원  
  `TXT / PDF / EPUB / PNG / JPG / GIF`

- 📦 일괄 변환  
  폴더 및 하위 폴더 자동 탐색

- 🗜 ZIP 직접 지원  
  압축 내부 파일 바로 변환

- 🖼 이미지 병합 변환  
  폴더 또는 ZIP 내 이미지를 하나의 `.xtc`로 생성

- 📊 실시간 진행률 UI  
  전체/개별 파일 상태 및 퍼센트 표시

- 🎨 커스터마이징 옵션  
  - 폰트 (TTF / OTF)
  - 해상도 (Width / Height)
  - 여백 / 폰트 크기 / 줄 간격

- 🧾 파일명 포맷 지원  
  `{name}`, `{ext}`, 날짜 기반 자동 네이밍

---

## 🧠 기술 스택

- 🖥 Electron
- ⚙ Node.js (JavaScript)
- 🔧 핵심 엔진: epub-to-xtc-converter
- 📦 주요 라이브러리:
  - adm-zip
  - pdf-to-png-converter
  - iconv-lite
  - jschardet

---

## 📖 사용 방법

1. 원본 폴더 및 저장 폴더 선택
2. 폰트 및 변환 옵션 설정
3. `변환 시작` 버튼 클릭
4. 진행률 및 로그 확인
5. 변환 완료 후 `.xtc` 파일 확인

📌 로그 영역에서 우클릭 시 전체 로그 복사 가능

---

## 🛠 개발자 가이드

### 설치
```bash
npm install
