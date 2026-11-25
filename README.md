# 퐁당퐁당 (stone-skipping)

스마트폰을 목표 자세에 맞추고 엄지로 화면을 튕겨 던지는 물수제비 게임. 세계 물수제비 명소를 도장깨기하며 장소별 랭킹에 도전한다.

- 기획서: 프로젝트의 Claude Doc "물수제비 센서 게임 기획서"
- 목표: iOS / Android 스토어 출시

## 구조

| 경로 | 내용 |
| --- | --- |
| `src/game/data.ts` | 캐릭터, 돌, 명소, 아이템 데이터 |
| `src/game/physics.ts` | 결정적 물수제비 물리 (같은 입력 + 시드 = 같은 결과, 랭킹 서버 검증용) |
| `src/game/scoring.ts` | 점수, 등급, 도장 미션 판정 |
| `src/input/pose.ts` | 폰 자세(롤·피치)와 안정성 추적 |
| `src/input/flick.ts` | 엄지 플릭 힘·방향 측정 |
| `blender/` | 블렌더 원본과 내보내기 스크립트 |

## 개발

```bash
npm install
npm run dev      # 같은 Wi-Fi의 폰에서 접속 (센서는 HTTPS 필요, 아래 참고)
npm test
npm run build
```

폰 브라우저의 모션 센서는 HTTPS에서만 동작한다. 개발 중에는 `npm run dev` 주소를 HTTPS 터널(예: cloudflared, ngrok)로 열거나 앱 빌드로 테스트한다. 데스크톱에서는 마우스 위치가 폰 자세를 대신하고, 드래그를 위로 튕기면 발사된다.

## 폰으로 해보기

main에 올라갈 때마다 GitHub Pages(HTTPS)에 자동 배포된다: https://dsoulkim-web.github.io/stone-skipping/
처음 한 번은 저장소 Settings → Pages → Source를 **GitHub Actions**로 바꿔야 한다.

## 스토어 빌드 (Capacitor)

```bash
npm run build
npx cap add ios       # 최초 1회, macOS + Xcode 필요
npx cap add android   # 최초 1회, Android Studio 필요
npx cap sync
npx cap open ios      # 또는 android
```

iOS는 `Info.plist`에 `NSMotionUsageDescription`(모션 센서 사용 이유)을 넣어야 한다.
