begin;
select plan(20);

select has_table('public', 'work_bays', 'work bays exist');
select has_table('public', 'business_hour_exceptions', 'calendar exceptions exist');
select has_table('public', 'reservation_segments', 'reservation segments exist');
select col_type_is('public', 'reservation_segments', 'segment_start', 'timestamp with time zone', 'segment start is timezone aware');
select col_type_is('public', 'reservation_segments', 'segment_end', 'timestamp with time zone', 'segment end is timezone aware');
select col_is_fk('public', 'reservation_segments', 'work_bay_id', 'segments reference a work bay');
select has_function('public', 'velora_calculate_segments', array['timestamp with time zone', 'integer', 'uuid'], 'segment calculator exists');
select has_function('public', 'create_scheduled_reservation_transactional', 'public scheduling transaction exists');
select has_function('public', 'admin_save_duration_reservation_transactional', 'admin scheduling transaction exists');
select policies_are('public', 'reservation_segments', array['server_only'], 'browser roles cannot access segments');
select hasnt_table_privilege('anon', 'public', 'reservation_segments', 'select', 'anonymous users cannot read schedule occupancy');
select results_eq(
  $$ select count(*)::bigint from public.work_bays where code in ('bay_1', 'bay_2', 'bay_3') and is_active $$,
  array[3::bigint],
  'three active work bays are configured'
);
select has_function('public', 'scheduling_availability', 'shared public availability wrapper exists');
select has_function('public', 'admin_scheduling_preview', 'shared admin preview wrapper exists');
select has_function('public', 'create_scheduled_reservation_transactional_v2', 'package-aware public transaction exists');
select has_function('public', 'admin_save_duration_reservation_v3', 'source-preserving admin transaction exists');
select has_column('public', 'reservations', 'pending_expires_at', 'pending reservations have an expiry timestamp');
select has_column('public', 'reservations', 'final_duration_minutes', 'reservations support final duration overrides');
select has_column('public', 'reservations', 'package_duration_minutes_snapshot', 'package duration is snapshotted');
select has_constraint('public', 'reservation_segments', 'reservation_segments_no_overlap', 'same-bay overlap is rejected by the database');

select * from finish();
rollback;
