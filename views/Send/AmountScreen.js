import {
  Avatar,
  Box,
  Button,
  Center,
  HStack,
  Input,
  Text,
  Toast,
} from 'native-base';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IoSwapVerticalOutline } from 'react-icons/io5';
import sb from 'satoshi-bitcoin';

import { BigButton } from '../../components/Button';
import { ToastRender } from '../../components/ToastRender';
import { useInterval } from '../../hooks/useInterval';
import { MESSAGE_TYPES } from '../../scripts/helpers/constants';
import { sendMessage } from '../../scripts/helpers/message';
import { validateTransaction } from '../../scripts/helpers/wallet';
import { sanitizeDogeInput, sanitizeFiat } from '../../utils/formatters';

const MAX_CHARACTERS = 10000;
const REFRESH_INTERVAL = 10000;

export const AmountScreen = ({
  setFormPage,
  errors,
  setErrors,
  setFormData,
  formData,
  walletAddress,
  selectedAddressIndex,
}) => {
  const [isCurrencySwapped, setIsCurrencySwapped] = useState(false);
  const [dogecoinPrice, setPepecoinPrice] = useState(0);
  const [addressBalance, setAddressBalance] = useState();
  const dogeInputRef = useRef(null);
  const fiatInputRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const getPepecoinPrice = useCallback(() => {
    sendMessage({ message: MESSAGE_TYPES.GET_DOGECOIN_PRICE }, ({ usd }) => {
      if (usd) {
        setPepecoinPrice(usd);
        onChangeTextDoge(formData.pepeAmount);
      }
    });
  }, [formData.pepeAmount, onChangeTextDoge]);

  useEffect(() => {
    getAddressBalance();
  }, [getAddressBalance, walletAddress]);

  const getAddressBalance = useCallback(() => {
    sendMessage(
      {
        message: MESSAGE_TYPES.GET_ADDRESS_BALANCE,
        data: { address: walletAddress },
      },
      (balance) => {
        if (balance) {
          setAddressBalance(balance);
        }
      }
    );
  }, [walletAddress]);

  useInterval(
    () => {
      getPepecoinPrice();
      getAddressBalance();
    },
    REFRESH_INTERVAL,
    true
  );

  const onChangeTextDoge = useCallback(
    (text) => {
      if (Number.isNaN(Number(text))) {
        return;
      }
      setErrors({ ...errors, pepeAmount: '' });
      const cleanText = sanitizeDogeInput(text) || '0';
      if (cleanText.length > MAX_CHARACTERS) {
        return;
      }

      const newFiatValue = parseFloat(cleanText * dogecoinPrice)
        .toFixed(2)
        .toString();

      setFormData({
        ...formData,
        pepeAmount: cleanText,
        fiatAmount: String(newFiatValue),
      });
    },
    [dogecoinPrice, errors, formData, setErrors, setFormData]
  );

  const onChangeTextFiat = useCallback(
    (text) => {
      if (Number.isNaN(Number(text))) {
        return;
      }
      setErrors({ ...errors, pepeAmount: '' });
      const isDeletion = text.length < formData.fiatAmount.length;
      const cleanText = sanitizeFiat(text, formData.fiatAmount, isDeletion);

      let newDogeValue = parseFloat(cleanText / dogecoinPrice);
      newDogeValue = parseFloat(newDogeValue.toFixed(2));

      if (newDogeValue.toString().length > MAX_CHARACTERS) return;

      setFormData({
        ...formData,
        fiatAmount: cleanText,
        pepeAmount: String(newDogeValue),
      });
    },
    [dogecoinPrice, errors, formData, setErrors, setFormData]
  );

  const swapInput = useCallback(() => {
    setIsCurrencySwapped((state) => !state);
  }, []);

  const onSetMax = useCallback(() => {
    onChangeTextDoge(String(sb.toBitcoin(addressBalance)));
  }, [addressBalance, onChangeTextDoge]);

  const onSubmit = useCallback(() => {
    setLoading(true);
    const txData = {
      senderAddress: walletAddress,
      recipientAddress: formData.address?.trim(),
      pepeAmount: formData.pepeAmount,
    };
    const error = validateTransaction({
      ...txData,
      addressBalance,
    });
    if (error) {
      setErrors({ ...errors, pepeAmount: error });
      setLoading(false);
    } else {
      sendMessage(
        {
          message: MESSAGE_TYPES.CREATE_TRANSACTION,
          data: txData,
        },
        ({ rawTx, fee, amount }) => {
          console.log('raw',rawTx,'fee',fee,'amount',amount);
          if (rawTx && fee !== undefined && amount) {
            setFormData({
              ...formData,
              rawTx,
              fee,
              pepeAmount: amount,
            });
            setFormPage('confirmation');
            setLoading(false);
          } else {
            setLoading(false);
            Toast.show({
              title: 'Error',
              description: 'Error creating transaction',
              duration: 3000,
              render: () => {
                return (
                  <ToastRender
                    title='Error'
                    description='Error creating transaction'
                    status='error'
                  />
                );
              },
            });
          }
        }
      );
    }
  }, [
    addressBalance,
    errors,
    formData,
    setErrors,
    setFormData,
    setFormPage,
    walletAddress,
  ]);

  return (
    <Center>
      <Text fontSize='sm' color='gray.500' textAlign='center' mb='8px'>
        <Text fontWeight='semibold' bg='gray.100' px='6px' rounded='md'>
          Address {selectedAddressIndex + 1}
        </Text>
        {'  '}
        {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-4)}
      </Text>
      <Text fontSize='xl' pb='4px' textAlign='center' fontWeight='semibold'>
        Paying
      </Text>
      <HStack alignItems='center' space='12px' pb='28px'>
        <Avatar size='sm' bg='brandGreen.500' _text={{ color: 'gray.800' }}>
          {formData.address?.substring(0, 2)}
        </Avatar>
        <Text
          fontSize='md'
          fontWeight='semibold'
          color='gray.500'
          textAlign='center'
        >
          {formData.address?.slice(0, 8)}...{formData.address?.slice(-4)}
        </Text>
      </HStack>
      <Box
        justifyContent='center'
        alignItems='center'
        pt='14px'
        pb='8px'
        w='80%'
        h='70px'
      >
        {!isCurrencySwapped ? (
          <Input
            keyboardType='numeric'
            // isDisabled={dogecoinPrice === 0}
            variant='filled'
            placeholder='0'
            focusOutlineColor='brandGreen.500'
            _hover={{
              borderColor: 'brandGreen.500',
            }}
            _invalid={{
              borderColor: 'red.500',
              focusOutlineColor: 'red.500',
              _hover: {
                borderColor: 'red.500',
              },
            }}
            isInvalid={errors.pepeAmount}
            onChangeText={onChangeTextDoge}
            onSubmitEditing={onSubmit}
            autoFocus
            type='number'
            fontSize='24px'
            fontWeight='semibold'
            _input={{
              py: '10px',
              pl: '4px',
              type: 'number',
            }}
            InputLeftElement={
              <Text fontSize='24px' fontWeight='semibold' px='4px'>
                Ᵽ
              </Text>
            }
            textAlign='center'
            ref={dogeInputRef}
            value={formData.pepeAmount}
            position='absolute'
            top={0}
          />
        ) : (
          <Input
            keyboardType='numeric'
            variant='filled'
            placeholder='0'
            focusOutlineColor='brandGreen.500'
            _hover={{
              borderColor: 'brandGreen.500',
            }}
            _invalid={{
              borderColor: 'red.500',
              focusOutlineColor: 'red.500',
              _hover: {
                borderColor: 'red.500',
              },
            }}
            isInvalid={errors.pepeAmount}
            onChangeText={onChangeTextFiat}
            onSubmitEditing={onSubmit}
            autoFocus
            type='number'
            fontSize='24px'
            fontWeight='semibold'
            _input={{
              py: '10px',
              pl: '4px',
              type: 'number',
            }}
            InputLeftElement={
              <Text fontSize='24px' fontWeight='semibold' px='4px'>
                $
              </Text>
            }
            textAlign='center'
            ref={fiatInputRef}
            value={formData.fiatAmount}
            position='absolute'
            top={0}
            allowFontScaling
            adjustsFontSizeToFit
          />
        )}
      </Box>

      <Text fontSize='10px' color='red.500'>
        {errors.pepeAmount || ' '}
      </Text>
      <BigButton
        variant='secondary'
        px='6px'
        py='4px'
        rounded='10px'
        mt='18px'
        mb='4px'
        onPress={swapInput}
      >
        <IoSwapVerticalOutline size='22px' style={{ paddingTop: 3 }} />
      </BigButton>
      <Text fontSize='20px' fontWeight='semibold' color='gray.500' pt='6px'>
        {!isCurrencySwapped ? '$' : 'Ᵽ'}
        {isCurrencySwapped
          ? formData.pepeAmount || 0
          : formData.fiatAmount || 0}
      </Text>
      <HStack alignItems='center' pt='12px' space='8px'>
        {addressBalance ? (
          <Text fontSize='14px' color='gray.500'>
            Balance: Ᵽ{sb.toBitcoin(addressBalance)}
          </Text>
        ) : null}
        <Button
          background='gray.400'
          px='6px'
          h='20px'
          rounded='6px'
          _hover={{ background: 'gray.500' }}
          onPress={onSetMax}
        >
          Max
        </Button>
      </HStack>
      <HStack alignItems='center' mt='60px' space='12px'>
        <Button
          variant='unstyled'
          colorScheme='coolGray'
          onPress={() => setFormPage('address')}
        >
          Back
        </Button>
        <BigButton
          onPress={onSubmit}
          type='submit'
          role='button'
          px='28px'
          isDisabled={
            !Number(formData.pepeAmount) || !addressBalance || errors.pepeAmount
          }
          loading={loading}
        >
          Next
        </BigButton>
      </HStack>
    </Center>
  );
};
