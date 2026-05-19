-- Keep login-session RPCs aligned with public.login_sessions.session_token.
-- The live schema uses text session tokens. Old uuid overloads make PostgREST
-- return PGRST203 because it cannot choose between text and uuid functions.

drop function if exists public.get_login_session(uuid);
drop function if exists public.get_daily_checkin_status(uuid);
drop function if exists public.claim_daily_checkin(uuid);
drop function if exists public.list_bets_with_login_session(uuid);
drop function if exists public.create_bet_with_login_session(uuid, integer, text, text, text, jsonb);
drop function if exists public.create_bet_with_login_session(uuid, integer, text, text, text, jsonb, text, timestamp with time zone);
drop function if exists public.create_market_chat_message(uuid, text, text);
drop function if exists public.list_current_race_bets_with_login_session(uuid, text, timestamp with time zone);
drop function if exists public.sign_out_login_session(uuid);

notify pgrst, 'reload schema';
