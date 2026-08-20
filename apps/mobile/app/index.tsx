import { StyleSheet, Text, View } from 'react-native';

import { APP_NAME } from '../src/config/app-name';

export default function Index() {
  return (
    <View style={styles.screen} testID="ready">
      <Text style={styles.title}>{APP_NAME}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0d0e',
  },
  title: {
    color: '#e8e4da',
    fontSize: 28,
    letterSpacing: 2,
  },
});
