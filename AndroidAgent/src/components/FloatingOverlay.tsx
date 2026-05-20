import React, {useState, useRef, useEffect, useCallback} from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  NativeModules,
  NativeEventEmitter,
  Alert,
  PermissionsAndroid,
} from 'react-native';
import {AgentState, AgentStatus} from '../types';
import {agentController} from '../services/AgentController';
import ConfirmationModal from './ConfirmationModal';

const {VoiceInputModule, ScreenCaptureModule} = NativeModules;
const voiceEmitter = new NativeEventEmitter(VoiceInputModule);

const SCREEN = Dimensions.get('window');
const BTN_SIZE = 64;
const MARGIN = 20;

type ButtonConfig = {
  label: string;
  bg: string;
  border: string;
  textColor: string;
};

function getButtonConfig(status: AgentStatus, actionCount: number, stepCount: number): ButtonConfig {
  switch (status) {
    case 'idle':
      return {label: '🎤', bg: '#FFFFFF', border: '#E5E7EB', textColor: '#111827'};
    case 'listening':
      return {label: '🔴', bg: '#FEE2E2', border: '#EF4444', textColor: '#EF4444'};
    case 'thinking':
      return {label: '🟠', bg: '#FFF7ED', border: '#F97316', textColor: '#F97316'};
    case 'executing':
      return {
        label: stepCount > 0 ? `${actionCount}/${stepCount}` : '⚙️',
        bg: '#EFF6FF',
        border: '#3B82F6',
        textColor: '#3B82F6',
      };
    case 'waiting_confirmation':
      return {label: '❓', bg: '#FFFBEB', border: '#F59E0B', textColor: '#F59E0B'};
    case 'done':
      return {label: '✅', bg: '#F0FDF4', border: '#22C55E', textColor: '#22C55E'};
    case 'failed':
      return {label: '❌', bg: '#FEF2F2', border: '#EF4444', textColor: '#EF4444'};
    default:
      return {label: '🎤', bg: '#FFFFFF', border: '#E5E7EB', textColor: '#111827'};
  }
}

interface Props {
  onSetupRequired?: () => void;
}

const FloatingOverlay: React.FC<Props> = ({onSetupRequired}) => {
  const [agentState, setAgentState] = useState<AgentState>(agentController.getState());
  const [partialTranscript, setPartialTranscript] = useState('');
  const [captureReady, setCaptureReady] = useState(false);

  // Position
  const pan = useRef(new Animated.ValueXY({
    x: SCREEN.width - BTN_SIZE - MARGIN,
    y: SCREEN.height - BTN_SIZE - MARGIN - 80,
  })).current;

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to agent state changes
  useEffect(() => {
    const unsub = agentController.subscribe(state => {
      setAgentState(state);

      if (state.status === 'done') {
        doneTimer.current = setTimeout(() => {
          agentController.stop();
        }, 3000);
      }
    });
    return unsub;
  }, []);

  // Cleanup done timer
  useEffect(() => {
    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  // Voice event listeners
  useEffect(() => {
    const partialSub = voiceEmitter.addListener(
      'VoicePartialResult',
      ({partial}: {partial: string}) => setPartialTranscript(partial),
    );
    const errorSub = voiceEmitter.addListener(
      'VoiceError',
      ({message}: {message: string}) => console.warn('Voice error:', message),
    );
    return () => {
      partialSub.remove();
      errorSub.remove();
    };
  }, []);

  // Pulse animation for listening state
  useEffect(() => {
    pulseLoop.current?.stop();
    spinLoop.current?.stop();

    if (agentState.status === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {toValue: 1.2, duration: 500, useNativeDriver: true}),
          Animated.timing(pulseAnim, {toValue: 1.0, duration: 500, useNativeDriver: true}),
        ]),
      );
      pulseLoop.current.start();
    } else if (agentState.status === 'thinking' || agentState.status === 'executing') {
      spinLoop.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spinLoop.current.start();
    } else {
      pulseAnim.setValue(1);
      spinAnim.setValue(0);
    }
  }, [agentState.status]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Drag gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        pan.setOffset({x: (pan.x as any)._value, y: (pan.y as any)._value});
        pan.setValue({x: 0, y: 0});
      },
      onPanResponderMove: Animated.event([null, {dx: pan.x, dy: pan.y}], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const x = Math.max(MARGIN, Math.min((pan.x as any)._value, SCREEN.width - BTN_SIZE - MARGIN));
        const y = Math.max(MARGIN, Math.min((pan.y as any)._value, SCREEN.height - BTN_SIZE - MARGIN));
        Animated.spring(pan, {toValue: {x, y}, useNativeDriver: false}).start();
      },
    }),
  ).current;

  // Request screen capture permission once
  const ensureCapturePermission = useCallback(async (): Promise<boolean> => {
    if (captureReady) return true;
    try {
      await ScreenCaptureModule.requestPermission();
      setCaptureReady(true);
      return true;
    } catch (e: any) {
      Alert.alert('Permission needed', 'Screen capture permission is required for the agent to see the screen.');
      return false;
    }
  }, [captureReady]);

  const handlePress = useCallback(async () => {
    const {status} = agentState;

    if (status === 'listening') {
      // Cancel listening
      await VoiceInputModule.cancelListening();
      return;
    }

    if (status === 'executing' || status === 'thinking') {
      // Stop the running agent
      agentController.stop();
      return;
    }

    if (status === 'done' || status === 'failed') {
      agentController.stop();
      return;
    }

    if (status === 'idle') {
      // Request permissions if needed
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: 'Microphone',
          message: 'Needed to hear your voice commands',
          buttonPositive: 'Allow',
        });
      } catch {}

      const ok = await ensureCapturePermission();
      if (!ok) return;

      // Start listening
      setPartialTranscript('');
      agentController['emit']({status: 'listening'});
      try {
        const transcript: string = await VoiceInputModule.startListening('en-US');
        if (transcript?.trim()) {
          await agentController.run(transcript.trim());
        } else {
          agentController.stop();
        }
      } catch (e: any) {
        agentController.stop();
      }
    }
  }, [agentState, ensureCapturePermission]);

  const {label, bg, border, textColor} = getButtonConfig(
    agentState.status,
    agentState.actionCount,
    agentState.steps.length,
  );

  const isSpinning = agentState.status === 'thinking' || agentState.status === 'executing';
  const isPulsing = agentState.status === 'listening';

  return (
    <>
      {/* Confirmation modal */}
      <ConfirmationModal
        visible={agentState.status === 'waiting_confirmation'}
        message={agentState.confirmationMessage ?? ''}
        onConfirm={() => agentController.confirmAction(true)}
        onCancel={() => agentController.confirmAction(false)}
      />

      {/* Status banner */}
      {(agentState.status !== 'idle' || partialTranscript) && (
        <Animated.View style={styles.banner} pointerEvents="none">
          {partialTranscript && agentState.status === 'listening' ? (
            <Text style={styles.bannerText} numberOfLines={2}>
              🎤 "{partialTranscript}"
            </Text>
          ) : agentState.currentStep ? (
            <Text style={styles.bannerText} numberOfLines={2}>
              {agentState.currentStep}
            </Text>
          ) : null}
          {agentState.lastError && (
            <Text style={styles.errorText} numberOfLines={2}>
              {agentState.lastError}
            </Text>
          )}
        </Animated.View>
      )}

      {/* Floating button */}
      <Animated.View
        style={[styles.wrapper, {transform: [{translateX: pan.x}, {translateY: pan.y}]}]}
        {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.85} onPress={handlePress}>
          <Animated.View
            style={[
              styles.button,
              {
                backgroundColor: bg,
                borderColor: border,
                transform: [
                  {scale: isPulsing ? pulseAnim : 1},
                  {rotate: isSpinning ? spin : '0deg'},
                ],
              },
            ]}>
            <Text style={[styles.btnLabel, {color: textColor}]}>{label}</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 9999,
  },
  button: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  btnLabel: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  banner: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15,15,30,0.92)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 9998,
    elevation: 9998,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bannerText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    marginTop: 4,
  },
});

export default FloatingOverlay;
