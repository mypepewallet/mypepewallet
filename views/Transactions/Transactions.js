import { Box, Center, HStack, Text } from 'native-base';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SceneMap, TabBar, TabView } from 'react-native-tab-view';
import { useParams, useSearchParams } from 'react-router-dom';

import { WalletDetailModal } from '../../components/Header/WalletDetailModal';
import { Layout } from '../../components/Layout';
import { useAppContext } from '../../hooks/useAppContext';
import { ActionButton } from './components/ActionButton';
import { Balance } from './components/Balance';
import { TransactionsTab } from './components/TransactionsTab';

const Receive = 'assets/receive.svg';
const Send = 'assets/send.svg';

export function Transactions() {
  const { transactionsData } = useAppContext();
  const {
    transactions,
    isLoadingTransactions,
    isLoadingMoreTransactions,
    hasMoreTransactions,
    fetchMoreTransactions,
    refreshTransactions,
    wallet,
    selectedAddressIndex,
    navigate,
  } = transactionsData;

  const [searchParams] = useSearchParams();

  const shouldRefresh = searchParams.get('refresh');

  useEffect(() => {
    if (shouldRefresh) {
      refreshTransactions();
    }
  }, [shouldRefresh, refreshTransactions]);

  const activeAddress = wallet.addresses[selectedAddressIndex];

  const activeAddressNickname =
    wallet.nicknames?.[activeAddress] ?? `Address ${selectedAddressIndex + 1}`;

  const [routes] = useState([
    { key: 'transactions', title: 'Transactions' }
  ]);

  const [addressDetailOpen, setAddressDetailOpen] = useState(false);

  const toggleReceiveModal = useCallback(() => {
    setAddressDetailOpen((val) => !val);
  }, []);

  const TransactionsRoute = useCallback(
    () => (
      <TransactionsTab
        toggleReceiveModal={toggleReceiveModal}
        transactions={transactions}
        loading={isLoadingTransactions}
        hasMore={hasMoreTransactions}
        fetchMore={fetchMoreTransactions}
        isLoadingMore={isLoadingMoreTransactions}
      />
    ),
    [
      toggleReceiveModal,
      transactions,
      isLoadingTransactions,
      hasMoreTransactions,
      fetchMoreTransactions,
      isLoadingMoreTransactions,
    ]
  );

  const renderScene = useMemo(
    () =>
      SceneMap({
        transactions: TransactionsRoute
      }),
    [TransactionsRoute]
  );

  const { tab } = useParams();

  const [txTabIndex, setTxTabIndex] = useState(
    routes.findIndex((r) => r.key === tab) ?? 0
  );

  return (
    <Layout withHeader withConnectStatus p={0}>
      <Box pt='60px'>
        <Balance walletAddress={activeAddress} />
        <Center>
          <HStack space='24px' pt='14px' pb='16px'>
            <ActionButton
              icon={Receive}
              label='Receive'
              onPress={toggleReceiveModal}
            />

            <ActionButton
              icon={Send}
              label='Send'
              onPress={() => navigate('Send')}
            />
          </HStack>
        </Center>
        <TabView
          navigationState={{ index: txTabIndex, routes }}
          renderScene={renderScene}
          onIndexChange={setTxTabIndex}
          initialLayout={{ width: 375 }}
          renderTabBar={(props) => (
            <TabBar
              indicatorStyle={{
                backgroundColor: '#e3ab02',
              }}
              style={{ backgroundColor: 'transparent' }}
              renderLabel={({ route, focused }) => (
                <Text
                  fontWeight='bold'
                  fontSize='14px'
                  color={focused ? 'black' : '#A1A1AA'}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {route.title}
                </Text>
              )}
              {...props}
            />
          )}
        />
      </Box>

      <WalletDetailModal
        showModal={addressDetailOpen}
        onClose={toggleReceiveModal}
        addressNickname={activeAddressNickname}
        wallet={wallet}
        allowEdit={false}
        address={activeAddress}
      />
    </Layout>
  );
}