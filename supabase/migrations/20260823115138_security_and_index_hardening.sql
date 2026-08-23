begin;

create index if not exists business_configuration_updated_by_idx
  on public.business_configuration (updated_by);
create index if not exists reservation_checklist_items_completed_by_idx
  on public.reservation_checklist_items (completed_by);
create index if not exists reservation_checklist_items_template_item_idx
  on public.reservation_checklist_items (template_item_id);
create index if not exists reservation_conditions_condition_level_idx
  on public.reservation_conditions (condition_level_id);
create index if not exists reservation_media_uploaded_by_idx
  on public.reservation_media (uploaded_by);
create index if not exists reservations_checklist_override_by_idx
  on public.reservations (checklist_override_by);
create index if not exists service_checklist_templates_template_idx
  on public.service_checklist_templates (template_id);

-- The browser receives no table privileges. Explicit deny policies document and
-- enforce the server-only boundary even if a future grant is added by mistake.
create policy "server functions only" on public.business_configuration
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.case_studies
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.case_study_media
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.checklist_template_items
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.checklist_templates
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.condition_indicators
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.condition_levels
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.notification_outbox
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.reservation_checklist_items
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.reservation_conditions
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.reservation_media
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.reviews
  for all to anon, authenticated using (false) with check (false);
create policy "server functions only" on public.service_checklist_templates
  for all to anon, authenticated using (false) with check (false);

commit;
