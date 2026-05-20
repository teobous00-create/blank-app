import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_KEY_STORAGE} from '../services/ClaudeService';

interface Props {
  onSetupComplete: () => void;
}

type PermissionState = 'pending' | 'granted' | 'denied';

interface PermItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  state: PermissionState;
}

const SetupScreen: React.FC<Props> = ({onSetupComplete}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<PermItem[]>([
    {
      id: 'audio',
      title: 'Microphone',
      description: 'To hear your voice commands',
      icon: '🎤',
      state: 'pending',
    },
    {
      id: 'overlay',
      title: 'Draw Over Other Apps',
      description: 'To show the control button while you use other apps',
      icon: '🪟',
      state: 'pending',
    },
    {
      id: 'accessibility',
      title: 'Accessibility Service',
      description: 'To tap buttons and type text in other apps on your behalf',
      icon: '♿',
      state: 'pending',
    },
  ]);

  const updatePermState = (id: string, state: PermissionState) => {
    setPermissions(prev =>
      prev.map(p => (p.id === id ? {...p, state} : p)),
    );
  };

  const requestAudio = useCallback(async () => {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'AndroidAgent needs microphone access to hear your voice commands.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    updatePermState('audio', result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied');
  }, []);

  const requestOverlay = useCallback(async () => {
    // SYSTEM_ALERT_WINDOW requires a Settings page on Android 6+
    Alert.alert(
      'Draw Over Other Apps',
      'You will be taken to Settings. Find "AndroidAgent" and enable "Allow display over other apps".',
      [
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.openSettings();
            updatePermState('overlay', 'granted'); // Assume granted after user visits settings
          },
        },
        {text: 'Cancel'},
      ],
    );
  }, []);

  const requestAccessibility = useCallback(() => {
    Alert.alert(
      'Accessibility Service',
      'You will be taken to Accessibility Settings.\n\nFind "AndroidAgent" under Installed Services and toggle it ON.',
      [
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS').catch(() =>
              Linking.openSettings(),
            );
            updatePermState('accessibility', 'granted');
          },
        },
        {text: 'Cancel'},
      ],
    );
  }, []);

  const handlePermissionPress = (id: string) => {
    if (id === 'audio') requestAudio();
    else if (id === 'overlay') requestOverlay();
    else if (id === 'accessibility') requestAccessibility();
  };

  const handleSave = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      Alert.alert('Invalid Key', 'The Anthropic API key should start with "sk-ant-"');
      return;
    }
    setSaving(true);
    await AsyncStorage.setItem(API_KEY_STORAGE, trimmed);
    setSaving(false);
    onSetupComplete();
  }, [apiKey, onSetupComplete]);

  const allPermissionsGranted = permissions.every(p => p.state === 'granted');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.logoText}>🤖</Text>
        <Text style={styles.title}>Android AI Agent</Text>
        <Text style={styles.subtitle}>
          Control any app with your voice, powered by Claude AI
        </Text>
      </View>

      {/* API Key */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔑  Anthropic API Key</Text>
        <Text style={styles.cardDesc}>
          Your key is stored only on this device and never sent to our servers.
          Get one at console.anthropic.com
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-ant-..."
            placeholderTextColor="#6B7280"
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowKey(v => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeIcon}>{showKey ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Permissions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔐  Permissions</Text>
        {permissions.map(perm => (
          <TouchableOpacity
            key={perm.id}
            style={[styles.permRow, perm.state === 'granted' && styles.permGranted]}
            onPress={() => handlePermissionPress(perm.id)}
            disabled={perm.state === 'granted'}>
            <Text style={styles.permIcon}>{perm.icon}</Text>
            <View style={styles.permText}>
              <Text style={styles.permTitle}>{perm.title}</Text>
              <Text style={styles.permDesc}>{perm.description}</Text>
            </View>
            <Text style={styles.permStatus}>
              {perm.state === 'granted' ? '✅' : perm.state === 'denied' ? '❌' : '›'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* How it works */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ℹ️  How It Works</Text>
        <Text style={styles.howText}>
          1. Tap the floating 🎤 button and speak your command{'\n'}
          2. Claude AI parses your intent and plans the steps{'\n'}
          3. The agent takes screenshots and controls apps{'\n'}
          4. You confirm before any payment or purchase
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.startBtn, (!apiKey.trim() || saving) && styles.startBtnDisabled]}
        onPress={handleSave}
        disabled={!apiKey.trim() || saving}>
        <Text style={styles.startText}>{saving ? 'Saving…' : "Let's Go →"}</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Tap each permission above to grant it, then press "Let's Go"
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1E',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    marginVertical: 32,
  },
  logoText: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F1F5F9',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2D2D3F',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E2E8F0',
    marginBottom: 10,
  },
  cardDesc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
    marginBottom: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: 'monospace',
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  eyeIcon: {
    fontSize: 18,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D3F',
  },
  permGranted: {
    opacity: 0.6,
  },
  permIcon: {
    fontSize: 22,
    marginRight: 14,
    width: 32,
    textAlign: 'center',
  },
  permText: {
    flex: 1,
  },
  permTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 2,
  },
  permDesc: {
    fontSize: 13,
    color: '#94A3B8',
  },
  permStatus: {
    fontSize: 18,
    marginLeft: 12,
    color: '#94A3B8',
  },
  howText: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 26,
  },
  startBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#6366F1',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  startBtnDisabled: {
    backgroundColor: '#374151',
    shadowOpacity: 0,
    elevation: 0,
  },
  startText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  note: {
    textAlign: 'center',
    color: '#4B5563',
    fontSize: 13,
    marginTop: 16,
    lineHeight: 20,
  },
});

export default SetupScreen;
