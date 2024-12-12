import '../styles/globals.css';

import { extendTheme, NativeBaseProvider } from 'native-base';
import Head from 'next/head';
import NoSSR from 'react-no-ssr';
import {
  MemoryRouter,
} from "react-router-dom";

import { AppContextProvider } from '../Context';

const theme = extendTheme({
  colors: {
    brandYellow: {
      100: '#fff8e6',
      200: '#feebb3',
      300: '#fede81',
      400: '#fdd14e',
      500: '#fdc41c',
      600: '#e3ab02',
      700: '#b18502',
      800: '##7e5f01',
      900: '##4c3901',
    },
    brandGreen: {
      100: '#e8f5e9',
      200: '#c8e6c9',
      300: '#a5d6a7',
      400: '#81c784',
      500: '#66bb6a',
      600: '#4caf50',
      700: '#43a047',
      800: '#388e3c',
      900: '#2e7d32',
    }
  },
});

function MyApp({ Component, pageProps }) {
  return (
    <NoSSR>
        <MemoryRouter>
          <AppContextProvider>
            <NativeBaseProvider isSSR={false} theme={theme}>
              <Head>
                <title>MyPepe</title>
              </Head>
              <Component {...pageProps} />
            </NativeBaseProvider>
          </AppContextProvider>
        </MemoryRouter>
    </NoSSR>
  );
}

export default MyApp;
