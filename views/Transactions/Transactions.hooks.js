import { useEffect } from 'react';
import useSWRInfinite from 'swr/infinite';

import {
  getTransactions,
  getTransactionsKey,
} from '../../dataFetchers/getTransactions';
import {
  TRANSACTION_PAGE_SIZE,
} from '../../scripts/helpers/constants';

const QUERY_INTERVAL = 10000;

export const useTransactions = ({ wallet, selectedAddressIndex, navigate }) => {
  const walletAddress = wallet?.addresses?.[selectedAddressIndex];

  const {
    data: transactionsData,
    size: transactionsPage,
    setSize: setTransactionsPage,
    isLoading: isLoadingTransactions,
  } = useSWRInfinite(
    !walletAddress
      ? null
      : (pageIndex, prevData) =>
          getTransactionsKey(pageIndex, prevData, walletAddress),
    getTransactions,
    {
      initialSize: 1,
      revalidateAll: false,
      revalidateFirstPage: true,
      persistSize: false,
      parallel: false,
      refreshInterval: QUERY_INTERVAL,
    }
  );
  const transactions = transactionsData?.flat() ?? undefined;

  const fetchMoreTransactions = () => setTransactionsPage(transactionsPage + 1);

  const isLoadingMoreTransactions =
    isLoadingTransactions ||
    (transactionsPage > 0 &&
      transactionsData &&
      typeof transactionsData[transactionsPage - 1] === 'undefined');

  const hasMoreTransactions =
    transactionsData &&
    !(
      transactionsData[transactionsData.length - 1]?.length <
      TRANSACTION_PAGE_SIZE
    );

  const refreshTransactions = () => {
    setTransactionsPage(1);
  };

  useEffect(() => {
    if (!walletAddress) {
      return;
    }
  }, [walletAddress]);

  return {
    transactions,
    isLoadingTransactions,
    isLoadingMoreTransactions,
    hasMoreTransactions,
    fetchMoreTransactions,
    refreshTransactions,
    wallet,
    selectedAddressIndex,
    navigate,
  };
};
