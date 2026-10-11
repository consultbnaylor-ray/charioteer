/**
 * Enables Apple voice-processing I/O on react-native-audio-api 0.13.6.
 *
 * The published recorder has no iosVoiceProcessing option (that flag is only in
 * the unreleased docs). AVAudioSessionModeVoiceChat alone does not turn on
 * AVAudioEngine echo cancellation. setVoiceProcessingEnabled has to run on the
 * input node when the engine is created and before the graph is attached, not
 * by stopping an engine that is already running. See Apple’s voice-processing
 * notes and https://github.com/software-mansion/react-native-audio-api/issues/464
 *
 * If enabling voice processing fails, or the engine will not start afterwards,
 * the call continues on a fresh engine without voice processing. The simulator
 * has no voice-processing hardware and yields silence, so it is skipped.
 * Re-run is safe: an older stop-and-restart insert is removed, and the new
 * marker is applied once.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'node_modules/react-native-audio-api/ios/audioapi/ios/system/AudioEngine.mm';
const marker = 'charioteerEnableVoiceProcessingBeforeGraph';
const legacy = 'if (restartEngine) {\n      [self.audioEngine stop];';

const enableMethod = `- (void)charioteerEnableVoiceProcessingBeforeGraph
{
#if TARGET_OS_SIMULATOR
  return;
#else
  if (charioteerVoiceProcessingDisabled || self.audioEngine == nil) {
    return;
  }
  // The graph is not attached yet. Never stop a running engine to flip this on.
  if (self.audioEngine.isRunning) {
    NSLog(@"[AudioEngine] Engine already running; leaving voice processing off");
    return;
  }
  NSError *voiceError = nil;
  AVAudioInputNode *input = self.audioEngine.inputNode;
  if (input != nil && [input setVoiceProcessingEnabled:YES error:&voiceError]) {
    return;
  }
  NSLog(@"[AudioEngine] Voice processing unavailable, continuing without it: %@", voiceError);
  charioteerVoiceProcessingDisabled = YES;
  if (self.inputNode == nil && self.sourceNodes.count == 0) {
    self.audioEngine = [[AVAudioEngine alloc] init];
  }
#endif
}

- (BOOL)charioteerStartEngineWithoutVoiceProcessing
{
#if TARGET_OS_SIMULATOR
  return NO;
#else
  if (charioteerVoiceProcessingRetrying) {
    return NO;
  }
  charioteerVoiceProcessingRetrying = YES;
  charioteerVoiceProcessingDisabled = YES;
  NSLog(@"[AudioEngine] Starting without voice processing");
  [self rebuildAudioEngine];
  if (self.audioEngine == nil || (self.inputRegistration != nil && self.inputNode == nil)) {
    NSLog(@"[AudioEngine] Input format still missing without voice processing");
    charioteerVoiceProcessingRetrying = NO;
    return NO;
  }
  NSError *retryError = nil;
  [self.audioEngine prepare];
  [self.audioEngine startAndReturnError:&retryError];
  if (retryError != nil) {
    NSLog(@"[AudioEngine] Start without voice processing failed: %@", retryError);
    charioteerVoiceProcessingRetrying = NO;
    return NO;
  }
  self.state = AudioEngineState::AudioEngineStateRunning;
  self.sessionDeactivationInvalidatedGraph = false;
  charioteerVoiceProcessingRetrying = NO;
  return YES;
#endif
}

`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

let source = readFileSync(path, 'utf8');
if (source.includes(marker)) {
  process.exit(0);
}

if (source.includes(legacy)) {
  const start = source.lastIndexOf('// Charioteer:', source.indexOf(legacy));
  const formatAt = source.indexOf('AVAudioFormat *inputFormat = [self currentInputConnectionFormat];', source.indexOf(legacy));
  if (start < 0 || formatAt < 0) fail('Could not remove the old voice-processing insert.');
  source = `${source.slice(0, start)}${source.slice(formatAt)}`;
}

if (!source.includes('@implementation AudioEngine\n')) fail('AudioEngine implementation anchor missing.');
source = source.replace(
  '@implementation AudioEngine\n',
  '@implementation AudioEngine\n\nstatic BOOL charioteerVoiceProcessingDisabled = NO;\nstatic BOOL charioteerVoiceProcessingRetrying = NO;\n',
);

if (!source.includes('- (void)createAudioEngineIfNeeded;\n')) fail('createAudioEngineIfNeeded declaration missing.');
source = source.replace(
  '- (void)createAudioEngineIfNeeded;\n',
  `- (void)createAudioEngineIfNeeded;\n- (void)${marker};\n- (BOOL)charioteerStartEngineWithoutVoiceProcessing;\n`,
);

const formatLine = '  AVAudioFormat *inputFormat = [self currentInputConnectionFormat];';
if (!source.includes(formatLine)) fail('Input format read missing.');
source = source.replace(formatLine, `  [self ${marker}];\n\n${formatLine}`);

const startFailure = `  if (error != nil) {
    NSLog(@"Error while starting the audio engine: %@", [error debugDescription]);
    return false;
  }`;
if (!source.includes(startFailure)) fail('Audio engine start failure block missing.');
source = source.replace(
  startFailure,
  `  if (error != nil) {
    NSLog(@"Error while starting the audio engine: %@", [error debugDescription]);
    if ([self charioteerStartEngineWithoutVoiceProcessing]) {
      return true;
    }
    return false;
  }`,
);

const missingInput = `  if (self.inputRegistration != nil && self.inputNode == nil) {
    NSLog(@"Error while materializing the audio input node: missing live input format");
    return false;
  }`;
if (!source.includes(missingInput)) fail('Missing input-format failure block.');
source = source.replace(
  missingInput,
  `  if (self.inputRegistration != nil && self.inputNode == nil) {
    NSLog(@"Error while materializing the audio input node: missing live input format");
    if ([self charioteerStartEngineWithoutVoiceProcessing]) {
      return true;
    }
    return false;
  }`,
);

const startMethod = '- (bool)startEngine\n{';
if (!source.includes(startMethod)) fail('startEngine missing.');
source = source.replace(startMethod, `${enableMethod}${startMethod}`);

writeFileSync(path, source);
