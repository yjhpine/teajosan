-- 점검 모드 끄기 (작업 완료 후 실행)
update app_settings
set maintenance_enabled = false,
    updated_at = now()
where id = 'default';

select maintenance_enabled, maintenance_message, updated_at from app_settings where id = 'default';
