import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { defaultNutritionSettings } from './nutrition';
import { defaultProfileSharing } from './profileSharing';
import {
  SECTION_SHARE_LABEL,
  SECTION_SHARE_SOME,
  applyNutritionSection,
  applyProfileSection,
  boxesBecomingVisible,
  nutritionSectionBoxes,
  reviewSectionPatch,
  runSectionSave,
  sectionShareConfirm,
  sectionShareState,
  youSectionBoxes,
  youSectionPatch,
} from './sectionShare';

describe('section share master', () => {
  it('derives off, on, and some shared from the boxes, and starts off', () => {
    expect(sectionShareState([])).toBe('off');
    expect(sectionShareState([{ on: false }, { on: false }])).toBe('off');
    expect(sectionShareState([{ on: true }, { on: true }])).toBe('on');
    expect(sectionShareState([{ on: true }, { on: false }])).toBe('mixed');
    expect(SECTION_SHARE_LABEL).toBe('Share Whole Section');
    expect(SECTION_SHARE_SOME).toBe('Some shared');
  });

  it('lists exactly the items that will become visible', () => {
    const boxes = [
      { id: 'meals', label: "Today's meals", on: true, sensitive: true },
      { id: 'town', label: 'Town', on: false, sensitive: false },
      { id: 'stage', label: 'Stage', on: false, sensitive: true },
    ];
    const becoming = boxesBecomingVisible(boxes);
    expect(becoming.map((box) => box.label)).toEqual(['Town', 'Stage']);
    expect(sectionShareConfirm(becoming, false)).toBe(
      'These will show on your profile: Town, Stage. Stage is health data under UK GDPR. Other members will see it. Share this section?',
    );
    expect(sectionShareConfirm(becoming, true)).toBe(
      'These will show on your profile: Town, Stage. Share this section?',
    );
    expect(sectionShareConfirm([{ label: 'Mood streak', sensitive: true }], false)).toBe(
      'Mood streak will show on your profile. This is health data under UK GDPR. Other members will see it. Share this section?',
    );
  });

  it('turns nutrition shares on together and leaves the personal wagon flag', () => {
    const current = { ...defaultNutritionSettings(), wagonOn: true, wagonNote: 'A hard week', kcalTarget: 2000, wagonVisible: false };
    const on = applyNutritionSection(current, true);
    expect(nutritionSectionBoxes(on).every((box) => box.on)).toBe(true);
    expect(nutritionSectionBoxes(current).map((box) => box.id)).toEqual([
      'shareFoodDiary',
      'shareCalories',
      'shareQuality',
      'shareProgress',
      'shareGoal',
      'wagonVisible',
    ]);
    expect(on.wagonOn).toBe(true);
    expect(on.wagonNote).toBe('A hard week');
    expect(on.kcalTarget).toBe(2000);
    expect(on.wagonVisible).toBe(true);
    const off = applyNutritionSection(on, false);
    expect(off.wagonOn).toBe(true);
    expect(off.wagonVisible).toBe(false);
    expect(off.shareFoodDiary).toBe(false);
    expect(off.shareGoal).toBe(false);
  });

  it('keeps the You wagon share in step with Nutrition and does not clear other profile flags', () => {
    const boxes = youSectionBoxes({
      pinned: false,
      pinnedOn: false,
      stageOn: false,
      townOn: true,
      reasons: [{ body: 'Sleep' }, { body: ' Sleep ' }],
      reasonBodies: [],
      wagonVisible: true,
    });
    expect(boxes.map((box) => box.label)).toEqual(['Stage', 'Town', 'Sleep', 'The wagon flag']);
    expect(sectionShareState(boxes)).toBe('mixed');
    const sharing = { ...defaultProfileSharing(), soberDays: true, milestones: true, moneySaved: true, pinnedQuote: true };
    const cleared = applyProfileSection(sharing, youSectionPatch(false, ['Sleep']), false);
    expect(cleared.soberDays).toBe(true);
    expect(cleared.milestones).toBe(true);
    expect(cleared.moneySaved).toBe(true);
    expect(cleared.pinnedQuote).toBe(true);
    expect(cleared.town).toBe(false);
    expect(cleared.stage).toBe(false);
    expect(cleared.bio).toBe(true);
    const shared = applyProfileSection(cleared, youSectionPatch(true, ['Sleep']), true);
    expect(shared.pinnedQuote).toBe(true);
    expect(shared.reasonBodies).toEqual(['Sleep']);
    expect(shared.soberDays).toBe(true);
  });

  it('turns a section off without dropping ids that belong to another section', () => {
    const sharing = {
      ...defaultProfileSharing(),
      gratitudeIds: ['keep', 'line'],
      gratitudePhotoIds: ['photo', 'other'],
      visionIds: ['vision'],
    };
    const next = applyProfileSection(sharing, { gratitudeIds: ['line'], gratitudePhotoIds: ['photo'] }, false);
    expect(next.gratitudeIds).toEqual(['keep']);
    expect(next.gratitudePhotoIds).toEqual(['other']);
    expect(next.visionIds).toEqual(['vision']);
  });

  it('rolls back an earlier write when a later one fails', async () => {
    const log: string[] = [];
    await expect(runSectionSave([
      { write: async () => { log.push('sharing'); }, undo: async () => { log.push('undo-sharing'); } },
      { write: async () => { throw new Error('nutrition failed'); }, undo: async () => { log.push('undo-nutrition'); } },
    ])).rejects.toThrow('nutrition failed');
    expect(log).toEqual(['sharing', 'undo-sharing']);
  });

  it('places a master on each page of box switches and leaves the individual switches', () => {
    const nutrition = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    const checkIn = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const diary = readFileSync('src/app/(main)/gratitude.tsx', 'utf8');
    const vision = readFileSync('src/ui/VisionBoard.tsx', 'utf8');
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const photos = readFileSync('src/ui/ProgressPhotos.tsx', 'utf8');
    const preview = readFileSync('src/app/(main)/public-profile.tsx', 'utf8');
    const review = readFileSync('src/app/(main)/sharing.tsx', 'utf8');
    const control = readFileSync('src/ui/SectionShare.tsx', 'utf8');
    expect(nutrition.indexOf('<NutritionSectionShare')).toBeLessThan(nutrition.indexOf('Log a meal'));
    expect(nutrition).toContain("Share today's meals");
    expect(you.indexOf('<YouSectionShare')).toBeLessThan(you.indexOf('View my public profile'));
    expect(you).toContain('label="Share stage"');
    expect(checkIn.indexOf('<CheckInSectionShare')).toBeLessThan(checkIn.indexOf('label="Share mood streak"'));
    expect(home.indexOf('<SoberSectionShare')).toBeLessThan(home.indexOf('Correct the sober start date'));
    expect(home.match(/<ShareOnProfile/g)).toHaveLength(1);
    expect(diary.indexOf('<GratitudeSectionShare')).toBeGreaterThan(-1);
    expect(diary).toContain('label="Share on profile"');
    expect(diary).toContain('label="Include photo"');
    expect(vision.indexOf('<VisionSectionShare')).toBeGreaterThan(-1);
    expect(vision).toContain('visionIds');
    expect(health.indexOf('<HealthSectionShare')).toBeLessThan(health.indexOf('<HealthBoard'));
    expect(photos.indexOf('<PhotoSectionShare')).toBeGreaterThan(-1);
    expect(photos).toContain('Share with community');
    expect(preview.indexOf('<ProfileTextSectionShare')).toBeLessThan(preview.indexOf('<PublicProfileCard'));
    expect(review.indexOf('<ReviewSectionShare')).toBeGreaterThan(-1);
    expect(review).toContain('label="Share milestones"');
    expect(control).toContain('disabled={locked}');
    expect(control).toContain('NUTRITION_SHARE_LOCKED');
    expect(control).toContain('PROFILE_HIDDEN_SHARE');
    expect(control).toContain('runSectionSave');
    expect(control).not.toContain('refresh(');
    expect(control).not.toContain('<ShareOnProfile');
    expect(control).not.toContain('<SharingGroup');
    const youMaster = control.slice(control.indexOf('function YouSectionShare'), control.indexOf('function CheckInSectionShare'));
    expect(youMaster).toContain('wagonVisible: on');
    expect(youMaster).not.toContain('wagonOn');
    const reviewPatch = reviewSectionPatch({ reasons: [], gratitude: [], vision: [] });
    expect(reviewPatch.soberDays).toBe(true);
    expect(Object.keys(reviewPatch)).not.toContain('wagonOn');
  });
});
