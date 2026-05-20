import React, {useState, useEffect} from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {NativeModules} from 'react-native';
import {API_KEY_STORAGE} from './src/services/ClaudeService';
import SetupScreen from './src/components/SetupScreen';
import FloatingOverlay from './src/components/FloatingOverlay';

type AppScreen = 'loading' | 'setup' | 'agent';

const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>('loading');

  useEffect(() => {
    NativeModules.StorageModule.getItem(API_KEY_STORAGE).then((key: string | null) => {
      setScreen(key ? 'agent' : 'setup');
    });
  }, []);

  if (screen === 'loading') {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F1E" />
      </View>
    );
  }

  if (screen === 'setup') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F1E" />
        <SafeAreaView style={styles.container}>
          <SetupScreen onSetupComplete={() => setScreen('agent')} />
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F1E" translucent />
      <View style={styles.container} pointerEvents="box-none">
        <FloatingOverlay />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0F0F1E',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default App;
