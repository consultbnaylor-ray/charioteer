import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { UserFacingError } from '@/domain/errors';
import { SIGN_IN_AGAIN } from '@/domain/edgeRetry';
import {
  isMealPickerCancel,
  MealEstimateError,
  mealEstimateCategoryFromStatus,
  mealEstimateLog,
  mealEstimateMessage,
  mealPhotoFailure,
} from '@/domain/mealEstimate';
import { PHOTO_READ_FAIL } from '@/domain/nutrition';

describe('meal estimate failures', () => {
  it('keeps a photo that never left the phone distinct from a model that could not read it', () => {
    const native = new Error("Call to function 'ExponentImageManipulator.manipulateAsync' has been rejected.\n→ Caused by: The file isn't readable");
    const shown = mealPhotoFailure(native);
    expect(shown.category).toBe('preparation');
    expect(shown.message).toBe(mealEstimateMessage('preparation'));
    expect(shown.message).not.toContain('Could not read that photo');
    expect(mealEstimateLog(shown.category)).toBe('meal: preparation');
    expect(mealEstimateLog('unreadable')).toBe('meal: unreadable');
    expect(mealEstimateLog('unreadable')).not.toMatch(/\d|jpeg|base64/i);
  });

  it('maps auth, network, the model, and credits without using the unread-photo sentence', () => {
    expect(mealPhotoFailure(new UserFacingError(SIGN_IN_AGAIN, 'generic')).category).toBe('auth');
    expect(mealPhotoFailure(new MealEstimateError('timeout')).message).toContain('too long');
    expect(mealPhotoFailure(new MealEstimateError('provider')).message).not.toContain('Could not read that photo');
    expect(mealEstimateCategoryFromStatus(401, 'unauthorised')).toBe('auth');
    expect(mealEstimateCategoryFromStatus(422, 'provider')).toBe('provider');
    expect(mealEstimateCategoryFromStatus(422, 'unread')).toBe('unreadable');
    expect(mealEstimateCategoryFromStatus(402, 'subscription_required')).toBe('credits');
    expect(mealEstimateCategoryFromStatus(429, 'limit_reached')).toBe('credits');
    expect(mealEstimateCategoryFromStatus(200, null)).toBeNull();
    expect(mealEstimateMessage('credits')).not.toMatch(/photo|jpeg|base64/i);
  });

  it('does not treat closing the photo picker as a failed reading', () => {
    expect(isMealPickerCancel(new Error('User cancelled image selection'))).toBe(true);
    expect(isMealPickerCancel({ code: 'ERR_CANCELED', message: 'The action was cancelled.' })).toBe(true);
    expect(isMealPickerCancel(new Error("The file isn't readable"))).toBe(false);
    expect(mealPhotoFailure(new Error("The file isn't readable")).category).toBe('preparation');
    expect(mealEstimateMessage('unreadable')).toBe(PHOTO_READ_FAIL);
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const photoRead = screen.slice(screen.indexOf('function readPhoto'), screen.indexOf('function samplePhoto'));
    const cancelled = photoRead.slice(photoRead.indexOf('if (!photo)'), photoRead.indexOf('captured = photo'));
    expect(cancelled).toContain('setEstimateError(previousError)');
    expect(cancelled).not.toContain('failEstimate');
    expect(photoRead).toContain('isMealPickerCancel');
    expect(screen).toContain('estimateErrorDay === logWindow.today');
  });

  it('does not save a meal photo to the phone library before or instead of the estimate', () => {
    const picker = readFileSync('src/ui/pickMealPhoto.ts', 'utf8');
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const save = readFileSync('src/ui/saveSharedPhoto.ts', 'utf8');
    const photoRead = screen.slice(screen.indexOf('function readPhoto'), screen.indexOf('function samplePhoto'));
    expect(picker).not.toContain('saveJpegToLibrary');
    expect(picker).not.toContain('expo-media-library');
    expect(picker).not.toMatch(/saveToPhotos|cameraRoll|createAsset/);
    expect(photoRead.indexOf('pickMealPhoto')).toBeLessThan(photoRead.indexOf('estimateMeal'));
    expect(photoRead).not.toContain('saveJpegToLibrary');
    expect(photoRead).not.toContain('expo-media-library');
    expect(photoRead.indexOf('estimateMeal')).toBeLessThan(photoRead.indexOf('keepCapturedMeal'));
    const stored = repo.slice(repo.indexOf('async saveFoodLog'), repo.indexOf('async updateFoodLog'));
    expect(stored).toContain("storage.from(FOOD_BUCKET).upload");
    expect(stored).not.toContain('saveJpegToLibrary');
    expect(save).toContain('requestPermissionsAsync(true)');
    expect(screen).not.toContain('requestAddOnlyPhotoSave');
  });
});
