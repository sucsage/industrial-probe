import React, { useState } from 'react';
import { render, Box } from 'ink';
import { StartupScreen }     from './screens/StartupScreen.js';
import { Menu }              from './Menu.js';
import { ScanScreen }        from './screens/ScanScreen.js';
import { ReadScreen }        from './screens/ReadScreen.js';
import { WriteScreen }       from './screens/WriteScreen.js';
import { MonitorScreen }     from './screens/MonitorScreen.js';
import { TestScreen }        from './screens/TestScreen.js';
import { LogScreen }         from './screens/LogScreen.js';
import { RtuScreen }         from './screens/RtuScreen.js';
import { RegisterMapScreen } from './screens/RegisterMapScreen.js';
import { MqttScreen }        from './screens/MqttScreen.js';
import { SimulatorScreen }   from './screens/SimulatorScreen.js';

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
