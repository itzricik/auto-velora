begin;

create index if not exists reservations_customer_idx
  on public.reservations (customer_id);
create index if not exists reservations_vehicle_idx
  on public.reservations (vehicle_id);
create index if not exists reservation_services_service_idx
  on public.reservation_services (service_id);
create index if not exists reservation_slots_reservation_idx
  on public.reservation_slots (reservation_id);
create index if not exists reservation_history_changed_by_idx
  on public.reservation_history (changed_by);

commit;
