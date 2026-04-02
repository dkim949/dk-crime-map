# Berlin Crime Map — Roadmap

## v1.1 — UX 개선
- [ ] 다국어 지원 (DE/EN/KO) — Anthropic 번역 파이프라인 연동, 프론트엔드 언어 토글
- [ ] 모바일 UX 개선 — bottom sheet, 지도/리스트 탭 전환
- [ ] 구역 클릭 시 해당 구역 사건 목록 필터링

## v1.2 — 사용자 참여
- [ ] 유저 리포트 기능 — 사건 제보 폼 (POST /reports, 이미 API 구현됨)
- [ ] 리포트 관리자 승인 후 지도 반영 (is_verified 플래그)
- [ ] 실시간 채팅 — 우측 상단 채팅 패널, WebSocket 기반 유저 교류

## v1.3 — 데이터 확장
- [ ] 추가 데이터 소스 — 베를린 소방서 출동 기록, 교통사고 공공 데이터
- [ ] RSS/Atom 피드 수집 — 경찰 공식 피드 모니터링
- [ ] 뉴스 기사 크롤링 — Berliner Morgenpost, Tagesspiegel 등

## v2.0 — 지역 확장
- [ ] 함부르크, 뮌헨 등 독일 주요 도시 추가
- [ ] 도시 선택 드롭다운 + 도시별 GeoJSON 경계
- [ ] 다중 도시 통계 비교 대시보드

## 인프라
- [ ] Anthropic API 키 갱신 (현재 401 에러)
- [ ] Vercel 프론트엔드 배포
- [ ] Supabase RLS 정책 검토 (현재 service_role key 사용 중)
- [ ] 에러 모니터링 (Sentry 등)
