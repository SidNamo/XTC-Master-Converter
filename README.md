📚 XTC Master Converter
XTC Master Converter는 다양한 문서 및 이미지 파일을 .xtc 형식으로 일괄 변환해주는 GUI 기반의 마스터 변환 툴입니다. bigbag/epub-to-xtc-converter 엔진을 기반으로 제작되었으며, **바이브 코딩(Vibe Coding)**을 통해 사용자 편의성을 극대화한 UI/UX를 제공합니다.

✨ 주요 특징 (Key Features)
다양한 포맷 지원: 이미지(PNG, JPG, GIF), 텍스트(TXT), PDF, EPUB 파일을 지원합니다.

일괄 변환 (Batch Conversion): 폴더 내의 수많은 파일을 한 번의 클릭으로 자동 변환합니다.

ZIP 파일 및 재귀 탐색: ZIP 압축 파일 내부의 파일은 물론, 하위 폴더까지 깊숙이 탐색하여 변환 대상을 찾아냅니다.

이미지 자동 병합: 폴더나 ZIP 내부에 흩어진 이미지들을 하나의 .xtc 파일로 깔끔하게 병합합니다.

커스텀 파일명 설정: {name}, {ext}, {yyyy}{mm}{dd} 등 태그를 활용해 저장될 파일명을 자유롭게 지정할 수 있습니다.

실시간 진행 상태: 전체 작업 진행률뿐만 아니라, 현재 변환 중인 파일의 페이지 단위 진행 상황을 실시간 바(Progress Bar)로 확인할 수 있습니다.

세밀한 렌더링 설정: 폰트 종류, 크기, 마진(Margins), 해상도(W/H)를 기기에 맞게 커스터마이징 가능합니다.

🛠 기술 스택 (Tech Stack)
Framework: Electron

Language: JavaScript (Node.js)

Core Engine: epub-to-xtc-converter

Libraries: adm-zip, pdf-to-png-converter, iconv-lite, jschardet

🚀 시작하기 (Getting Started)
설치 요구 사항
Node.js (LTS 권장)

프로젝트 루트 폴더 내에 epub-to-xtc-converter 엔진 폴더가 위치해야 합니다.

실행 방법
Bash
# 의존성 설치
npm install

# 앱 실행
npm start

# 빌드 (포터블 실행 파일 생성)
npm run build
📖 사용 방법 (Usage)
경로 설정: 원본 파일이 담긴 폴더와 변환 결과가 저장될 폴더를 선택합니다.

텍스트 설정: 사용할 폰트 파일(.ttf, .otf)을 선택하고 글자 크기 및 여백을 조절합니다.

파일명 포맷: 저장될 파일의 이름 규칙을 정합니다. (예: {name}_converted.{ext}.xtc)

변환 시작: '변환 시작' 버튼을 누르면 일괄 작업이 시작됩니다.

로그 확인: 하단 테이블을 통해 각 파일별 변환 성공 여부와 용량 변화를 확인할 수 있습니다.

🤝 기여 및 출처 (Credits)
Author: Namo

Core Engine: 본 프로그램의 핵심 변환 로직은 bigbag님의 epub-to-xtc-converter를 기반으로 합니다. 훌륭한 오픈소스를 공유해주셔서 감사합니다.

Methodology: 이 프로젝트는 AI와 함께 호흡하며 코드를 작성하는 Vibe Coding 방식으로 개발되었습니다.

📄 라이선스 (License)
이 프로젝트는 MIT 라이선스를 따릅니다.

Note: 본 프로그램은 개인적인 용도로 최적화되어 있으며, 특정 E-ink 단말기나 뷰어에서 .xtc 파일을 사용하는 사용자에게 최고의 경험을 제공합니다.

멋진 프로젝트가 되길 바랍니다! 추가로 수정하고 싶은 문구(예: 본인의 실제 GitHub 주소 등)가 있다면 알려주세요.