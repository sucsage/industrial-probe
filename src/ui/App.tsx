import React, { useState } from 'react';
import { render, Box } from 'ink';
import { StartupScreen }     from './screens/StartupScreen';
import { Menu }              from './Menu';
import { ScanScreen }        from './screens/ScanScreen';
import { ReadScreen }        from './screens/ReadScreen';
import { WriteScreen }       from './screens/WriteScreen';
import { MonitorScreen }     from './screens/MonitorScreen';
import { TestScreen }        from './screens/TestScreen';
import { LogScreen }         from './screens/LogScreen';
import { RtuScreen }         from './screens/RtuScreen';
import { RegisterMapScreen } from './screens/RegisterMapScreen';
import { MqttScreen }        from './screens/MqttScreen';
import { SimulatorScreen }   from './screens/SimulatorScreen';

type Screen =
  | 'startup'
  | 'menu'
  | 'scan' | 'read' | 'write' | 'monitor' | 'regmap'
  | 'rtu'
  | 'mqtt'
  | 'test' | 'log'
  | 'sim';

function App() {
  const [screen, setScreen] = useState<Screen>('startup');
  const back = () => setScreen('menu');

  return (
    <Box flexDirection="column" padding={1}>
      {screen === 'startup'  && <StartupScreen onDone={() => setScreen('menu')} />}
      {screen === 'menu'     && <Menu onSelect={setScreen} />}
      {screen === 'scan'     && <ScanScreen onBack={back} />}
      {screen === 'read'     && <ReadScreen onBack={back} />}
      {screen === 'write'    && <WriteScreen onBack={back} />}
      {screen === 'monitor'  && <MonitorScreen onBack={back} />}
      {screen === 'regmap'   && <RegisterMapScreen onBack={back} />}
      {screen === 'rtu'      && <RtuScreen onBack={back} />}
      {screen === 'mqtt'     && <MqttScreen onBack={back} />}
      {screen === 'test'     && <TestScreen onBack={back} />}
      {screen === 'log'      && <LogScreen onBack={back} />}
      {screen === 'sim'      && <SimulatorScreen onBack={back} />}
    </Box>
  );
}

export function renderApp() {
  render(<App />);
}
