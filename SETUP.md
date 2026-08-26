# 태조산 합주 캘린더 — 인터넷 공유 / DB 설정

## 1) Supabase (무료 DB) 만들기
1. https://supabase.com 에서 GitHub로 로그인
2. New project → 이름 `teajosan` → 리전은 Northeast Asia(서울) 있으면 선택
3. Project Settings → API 에서
   - Project URL
   - anon public key
   를 복사
4. SQL Editor에서 `supabase/schema.sql` 전체 실행

## 2) 로컬 연결
프로젝트 루트에 `.env.local` 생성:

```
VITE_SUPABASE_URL=여기에_URL
VITE_SUPABASE_ANON_KEY=여기에_anon_key
```

그다음 `npm run dev`

## 3) 깃허브 Pages 배포
저장소 Secrets에 추가:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Settings → Pages → Source: GitHub Actions

배포 후 주소 예: `https://yjhpine.github.io/teajosan/`

## 동작
- 기수/이름 로그인 → 같은 기기(브라우저)에서는 자동 재입장
- 로그인·합주 등록/수정/삭제 로그가 DB에 저장 (IP 포함)
- 멤버 모두 같은 일정/로그를 공유
