-- The owner can correct a photo's date, month, and note after it is saved.
-- Visibility keeps its own column grant. There is no table-level UPDATE,
-- and other people still cannot write on a photo.

grant update (note, taken_on, month_index) on public.progress_photos to authenticated;
