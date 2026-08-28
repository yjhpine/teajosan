-- 점검 모드 켜기 (작업 시작 전 실행)
update app_settings
set maintenance_enabled = true,
    maintenance_message = coalesce(nullif(trim(maintenance_message), ''), '지금은 점검 중입니다. 잠시 후 다시 접속해 주세요.'),
    updated_at = now()
where id = 'default';

select maintenance_enabled, maintenance_message, updated_at from app_settings where id = 'default';
