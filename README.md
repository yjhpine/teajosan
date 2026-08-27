# 태조산 합주 캘린더

학교 밴드 합주 일정·곡 리스트·멤버 세션을 공유하는 웹 앱입니다.

- **로그인**: 이름 + PIN (가입 시 기수·세션 등록)
- **일정**: 주간/월간 합주 캘린더 (본인 합주만 수정·삭제)
- **곡 리스트**: 세션별 멤버 배정 (전원 수정, 등록자만 삭제)
- **배포**: GitHub Pages (`main` push 시 자동)

## 시작하기

자세한 DB·환경 설정은 **[SETUP.md](SETUP.md)** 를 보세요.

```bash
npm install
cp .env.local.example .env.local   # 또는 SETUP 안내대로 생성
npm run dev
```

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 로컬 개발 |
| `npm run build` | 프로덕션 빌드 |
| `node scripts/verify-security.mjs` | RPC/RLS 스모크 테스트 (`.env.local` 필요) |
