/**
 * Enables Apple voice-processing I/O on react-native-audio-api 0.13.6.
 *
 * The published recorder has no iosVoiceProcessing option (that flag is only in
 * the unreleased docs). AVAudioSessionModeVoiceChat alone does not turn on
 * AVAudioEngine echo cancellation; setVoiceProcessingEnabled has to run on the
 * input node before the engine starts. See Apple’s voice-processing notes and
 * https://github.com/software-mansion/react-native-audio-api/issues/464
 *
 * The simulator has no voice-processing hardware and yields silence, so it is skipped.
 * Re-run is safe: the marker is inserted once.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'node_modules/react-native-audio-api/ios/audioapi/ios/system/AudioEngine.mm';
const marker = 'setVoiceProcessingEnabled:YES';
const needle = '  AVAudioFormat *inputFormat = [self currentInputConnectionFormat];';
const insert = `  // Charioteer: acoustic echo cancellation, noise suppression, and gain control.
  // Enable before the input format is read. Voice processing changes that format,
  // and it has to be on before the engine is running.
#if !TARGET_OS_SIMULATOR
  {
    const BOOL restartEngine = self.audioEngine.isRunning;
    if (restartEngine) {
      [self.audioEngine stop];
    }
    NSError *voiceError = nil;
    if (![self.audioEngine.inputNode setVoiceProcessingEnabled:YES error:&voiceError]) {
      NSLog(@"[AudioEngine] Voice processing unavailable: %@", voiceError);
    }
    if (restartEngine) {
      NSError *restartError = nil;
      if (![self.audioEngine startAndReturnError:&restartError]) {
        NSLog(@"[AudioEngine] Restart after voice processing failed: %@", restartError);
      }
    }
  }
#endif

  AVAudioFormat *inputFormat = [self currentInputConnectionFormat];`;

const source = readFileSync(path, 'utf8');
if (source.includes(marker)) {
  process.exit(0);
}
if (!source.includes(needle)) {
  console.error('AudioEngine.mm has no currentInputConnectionFormat read. Voice processing was not enabled.');
  process.exit(1);
}
writeFileSync(path, source.replace(needle, insert));
