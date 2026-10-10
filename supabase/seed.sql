-- Catalogue rows. Keep src/data/catalogue.ts in step with this file.

insert into public.interests (id, slug, label) values
  ('10000000-0000-4000-8000-000000000001', 'swimming', 'Swimming'),
  ('10000000-0000-4000-8000-000000000002', 'hiking', 'Hiking'),
  ('10000000-0000-4000-8000-000000000003', 'dancing', 'Dancing'),
  ('10000000-0000-4000-8000-000000000004', 'sober-raving', 'Sober raving'),
  ('10000000-0000-4000-8000-000000000005', 'cinema-meals', 'Cinema/Meals'),
  ('10000000-0000-4000-8000-000000000006', 'nights-in', 'Nights in'),
  ('10000000-0000-4000-8000-000000000007', 'reading', 'Reading'),
  ('10000000-0000-4000-8000-000000000008', 'running', 'Running'),
  ('10000000-0000-4000-8000-000000000009', 'cooking', 'Cooking'),
  ('10000000-0000-4000-8000-000000000010', 'yoga', 'Yoga')
on conflict (id) do nothing;

insert into public.resources (id, category, title, detail, url, phone, verification, verification_note, sort_order) values
  ('20000000-0000-4000-8000-000000000001', 'quit_lit', 'This Naked Mind', 'Annie Grace. A widely read book about changing your beliefs around alcohol.', null, null, 'unverified', 'Title and author only. No shop or publisher link is included because one official page was not confirmed in this pass.', 0),
  ('20000000-0000-4000-8000-000000000002', 'quit_lit', 'The Unexpected Joy of Being Sober', 'Catherine Gray. A memoir about stopping, and the life that showed up afterwards.', null, null, 'unverified', 'Title and author only. No outbound link was confirmed in this pass.', 1),
  ('20000000-0000-4000-8000-000000000003', 'quit_lit', 'Alcohol Explained', 'William Porter. A plain-language account of what alcohol does, physically and mentally.', null, null, 'unverified', 'Title and author only. No outbound link was confirmed in this pass.', 2),
  ('20000000-0000-4000-8000-000000000004', 'quit_lit', 'Quit Like a Woman', 'Holly Whitaker. A feminist look at drinking culture and another way out.', null, null, 'unverified', 'Title and author only. No outbound link was confirmed in this pass.', 3),
  ('20000000-0000-4000-8000-000000000005', 'quit_lit', 'The Sober Diaries', 'Clare Pooley. A year of stopping, written as a diary.', null, null, 'unverified', 'Title and author only. No outbound link was confirmed in this pass.', 4),
  ('20000000-0000-4000-8000-000000000006', 'quit_lit', 'Drink? The New Science of Alcohol and Your Health', 'Professor David Nutt. The science of alcohol and health, written for a general reader.', null, null, 'unverified', 'Title and author only. No outbound link was confirmed in this pass.', 5),
  ('20000000-0000-4000-8000-000000000007', 'quit_lit', 'How to Be a Mindful Drinker', 'Dru Jaeger, with the Club Soda community. For cutting down, taking a break, or stopping.', 'https://joinclubsoda.com/how-to-be-a-mindful-drinker/', null, 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 6),
  ('20000000-0000-4000-8000-000000000011', 'groups', 'Alcoholics Anonymous Great Britain', 'Free 12-step meetings and a national helpline. Phone 0800 917 7650, or email help@aamail.org.', 'https://www.alcoholics-anonymous.org.uk/helpline/', '0800 917 7650', 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 7),
  ('20000000-0000-4000-8000-000000000012', 'groups', 'SMART Recovery UK', 'Free mutual-aid meetings, face to face and online, built around cognitive behavioural tools.', 'https://smartrecovery.org.uk/', null, 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 8),
  ('20000000-0000-4000-8000-000000000013', 'groups', 'Club Soda', 'Courses, events, and a mindful-drinking community if you want to cut down, pause, or stop.', 'https://joinclubsoda.com/', null, 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 9),
  ('20000000-0000-4000-8000-000000000014', 'groups', 'Al-Anon Family Groups UK & Eire', 'For anyone affected by someone else’s drinking. Helpline 0800 0086 811, 10am to 10pm, every day.', 'https://al-anonuk.org.uk/getting-help/helpline/', '0800 0086 811', 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 10),
  ('20000000-0000-4000-8000-000000000015', 'groups', 'Nacoa', 'The National Association for Children of Alcoholics. Free helpline 0800 358 3456, listed by the NHS.', null, '0800 358 3456', 'partial', 'The phone number is on the NHS alcohol support page. The charity’s own website was not opened in this pass, so no link is shown.', 11),
  ('20000000-0000-4000-8000-000000000021', 'helplines', 'Drinkline', 'National alcohol helpline. Free and confidential. Weekdays 9am to 8pm, weekends 11am to 4pm.', 'https://www.nhs.uk/live-well/alcohol-advice/alcohol-support/', '0300 123 1110', 'verified', 'Number and hours taken from the NHS alcohol support page.', 12),
  ('20000000-0000-4000-8000-000000000022', 'helplines', 'Samaritans', 'For anyone in distress, including suicidal thoughts. Free, 24 hours a day.', 'https://www.samaritans.org/how-we-can-help/contact-samaritan/', '116 123', 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 13),
  ('20000000-0000-4000-8000-000000000023', 'helplines', 'NHS 111', 'Urgent medical help when it is not a 999 emergency. Use this if you are worried about withdrawal and cannot reach your GP.', 'https://111.nhs.uk/', '111', 'verified', '111 is the NHS urgent medical number. The online service is 111.nhs.uk.', 14),
  ('20000000-0000-4000-8000-000000000024', 'helplines', 'Emergency services', 'Call 999 if someone is having a seizure, is confused, has collapsed, or is in immediate danger.', null, '999', 'verified', 'UK emergency number. The NHS alcohol-use disorder page tells people to call 999 for severe withdrawal.', 15),
  ('20000000-0000-4000-8000-000000000031', 'health', 'The risks of drinking too much', 'NHS guidance on the 14-unit week, and the illnesses regular heavy drinking makes more likely.', 'https://www.nhs.uk/live-well/alcohol-advice/the-risks-of-drinking-too-much/', null, 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 16),
  ('20000000-0000-4000-8000-000000000032', 'health', 'Alcohol support', 'NHS page on Drinkline, mutual-aid groups, and why stopping overnight can be harmful if you are dependent.', 'https://www.nhs.uk/live-well/alcohol-advice/alcohol-support/', null, 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 17),
  ('20000000-0000-4000-8000-000000000033', 'health', 'Alcohol-use disorder', 'NHS page on dependence, withdrawal symptoms, and when to call 999.', 'https://www.nhs.uk/conditions/alcohol-use-disorder/', null, 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 18),
  ('20000000-0000-4000-8000-000000000034', 'health', 'Find alcohol addiction support', 'NHS service finder for local alcohol support in England.', 'https://www.nhs.uk/nhs-services/find-alcohol-addiction-support-services/', null, 'verified', 'Checked against the organisation or NHS page on 10 October 2026.', 19),
  ('20000000-0000-4000-8000-000000000035', 'health', 'Sleep and tiredness', 'NHS Live Well on sleep. Useful once the drinking is quieter and your nights are still unsettled.', 'https://www.nhs.uk/live-well/sleep-and-tiredness/', null, 'partial', 'Canonical NHS Live Well address. The page was not re-opened in this pass.', 20),
  ('20000000-0000-4000-8000-000000000036', 'health', 'Exercise', 'NHS Live Well on moving your body.', 'https://www.nhs.uk/live-well/exercise/', null, 'partial', 'Canonical NHS Live Well address. The page was not re-opened in this pass.', 21),
  ('20000000-0000-4000-8000-000000000037', 'health', 'Eat well', 'NHS Live Well on food. Appetite and blood sugar can be all over the place in early sobriety.', 'https://www.nhs.uk/live-well/eat-well/', null, 'partial', 'Canonical NHS Live Well address. The page was not re-opened in this pass.', 22),
  ('20000000-0000-4000-8000-000000000038', 'health', 'Every Mind Matters', 'NHS mental health tips, including anxiety and low mood.', 'https://www.nhs.uk/every-mind-matters/', null, 'partial', 'Canonical NHS address. The page was not re-opened in this pass.', 23)
on conflict (id) do nothing;


-- Sample accounts. If a future Supabase auth schema rejects the insert, reference
-- data above is already in place and the app's demo mode still has the same people.
do $$
declare
  pwd text := extensions.crypt('Charioteer-demo-1', extensions.gen_salt('bf'));
  person record;
begin
  for person in
    select * from (values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'alex.hart@example.com', 'Alex Hart'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 'jordan.ellis@example.com', 'Jordan Ellis'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid, 'sam.okonkwo@example.com', 'Sam Okonkwo'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid, 'priya.shah@example.com', 'Priya Shah'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'::uuid, 'rowan.blake@example.com', 'Rowan Blake')
    ) as t(id, email, name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', person.id, 'authenticated', 'authenticated',
      person.email, pwd, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', person.name),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), person.id,
      jsonb_build_object('sub', person.id::text, 'email', person.email),
      'email', person.id::text, now(), now(), now()
    );
  end loop;

  update public.profiles set
    display_name = 'Alex Hart',
    sobriety_started_at = now() - interval '47 days 6 hours',
    weekly_spend_gbp = 48,
    weekly_units = 30,
    town = 'Bristol',
    age_confirmed_18 = true,
    community_visible = true,
    consent_health = true,
    consent_ai = true,
    onboarding_complete = true
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

  update public.profiles set display_name = 'Jordan Ellis', town = 'Manchester', age_confirmed_18 = true, community_visible = true, consent_health = true, consent_ai = true, onboarding_complete = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  update public.profiles set display_name = 'Sam Okonkwo', town = 'Leeds', age_confirmed_18 = true, community_visible = true, consent_health = true, consent_ai = true, onboarding_complete = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  update public.profiles set display_name = 'Priya Shah', town = 'London', age_confirmed_18 = true, community_visible = true, consent_health = true, consent_ai = true, onboarding_complete = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  update public.profiles set display_name = 'Rowan Blake', town = 'Glasgow', age_confirmed_18 = true, community_visible = true, consent_health = true, consent_ai = true, onboarding_complete = true, is_moderator = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';

  insert into public.profile_interests (user_id, interest_id) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '10000000-0000-4000-8000-000000000002'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '10000000-0000-4000-8000-000000000005'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '10000000-0000-4000-8000-000000000006'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '10000000-0000-4000-8000-000000000002'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '10000000-0000-4000-8000-000000000001'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '10000000-0000-4000-8000-000000000004'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '10000000-0000-4000-8000-000000000006'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '10000000-0000-4000-8000-000000000003'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '10000000-0000-4000-8000-000000000005'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '10000000-0000-4000-8000-000000000009'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '10000000-0000-4000-8000-000000000007');

  insert into public.reasons (user_id, body, sort_order) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'I want to remember my evenings.', 0),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'My sleep has been a mess for years.', 1),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'I want to be present for my sister''s wedding in June.', 2);

  insert into public.connections (id, requester_id, addressee_id, status) values
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'accepted'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'pending');

  insert into public.direct_messages (connection_id, sender_id, body) values
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Sunday hike is still on, if you want a lift towards the bridge.'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'I will be there. Early, before anywhere is open.'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Coffee after. No fuss if you need to head off.');
exception when others then
  raise notice 'Sample accounts were skipped: %', sqlerrm;
end $$;
