import {
  Box,
  Button,
  Center,
  Flex,
  Heading,
  Image,
  Input,
  SimpleGrid,
  Text,
} from '@chakra-ui/react';
import { Alchemy, Network, Utils } from 'alchemy-sdk';
import { useEffect, useRef, useState } from 'react';
import { createWeb3Modal, defaultConfig } from "@web3modal/ethers5"
import { useWeb3ModalAccount } from "@web3modal/ethers5/react"
import { ConnectButton } from "./ConnectButton.jsx"
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { LoadingIndicator } from "./LoadingIndicator.jsx"
import { ethers } from "ethers"
import { trackPromise } from "react-promise-tracker"

// 1. Get projectId at https://cloud.walletconnect.com
const projectId = 'd671bd1a92461f4de8a4d2320f541e54'

const MAINNET_RPC_URL = "https://eth-mainnet.g.alchemy.com/v2/bULQ8HZ7Sgpo2oTDOaTMxrSS_SOJFnys";

const mainnet = {
  chainId: 1, name: 'Ethereum', currency: 'ETH', explorerUrl: 'https://etherscan.io/', rpcUrl: MAINNET_RPC_URL
}

const metadata = {
  name: 'NFT Indexer',
  description: 'List NFT contracts in given wallet',
  url: 'https://artsyfartsy.com/',
  icons: ['https://artsyfartsy.com/']
}

createWeb3Modal({
  ethersConfig: defaultConfig({ metadata }), chains: [mainnet], projectId
})

function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value; //assign the value of ref to the argument
  }, [value]); //this code will run when the value of 'value' changes
  return ref.current; //in the end, return the current ref value.
}

const addressMap = new Map();

function App() {
  const [userAddress, setUserAddress] = useState('');
  const lastUserAddress = usePrevious(userAddress);
  const [results, setResults] = useState([]);
  const [showIsAddrError, setShowIsAddrError] = useState(false);
  const { address: walletConnectAddress, chainId, isConnected } = useWeb3ModalAccount();

  const resetResults = () => setResults({ ownedNfts: [] });

  useEffect(() => {
    console.log(`walletConnectAddress changed: ${walletConnectAddress}`);
    setShowIsAddrError(false);
    if (walletConnectAddress != null) {
      setUserAddress(walletConnectAddress);
    } else {
      resetResults();
      setUserAddress('')
    }
  }, [walletConnectAddress]);

  useEffect(() => {
    setShowIsAddrError(false);
    getNFTsForOwner();
  }, [userAddress])

  async function getNFTsForOwner() {
    const haveString = (str) => str != null && str.length > 0;
    const isENS = (addr) => addr.search(/\.eth$/) > -1;
    const isPublicKey = (addr) => ethers.utils.isAddress(addr);

    const config = {
      apiKey: '8W7zKgmn4QUHaEdD_leww7KUQOpYphSd',
      network: Network.ETH_MAINNET,
    };

    const alchemy = new Alchemy(config);

    if (!haveString(userAddress) && !(isENS(userAddress) || isPublicKey(userAddress))) {
      resetResults();
      return;
    }
    console.log(`address: ${userAddress}`)
    if (isENS(userAddress)) {
      const origAddr = userAddress;
      const address = await trackPromise(alchemy.core.resolveName(userAddress));
      if (!haveString(address)) {
        console.log(`lookup for ${origAddr} failed`)
        toast.error(`lookup for ${origAddr} as ENS failed`);
        resetResults();
        return;
      }
      console.log(`lookup for ${origAddr} - ${address}`);
      setUserAddress(address);
      return;
    }
    if (userAddress != lastUserAddress && isPublicKey(userAddress)) {
      // Cache tokens for address to avoid unnecessary network calls.  We need a way to know if userAddress has any
      // new tokens, or we could just "expire" a cache and refresh every-now-and-then.
      /* DEBUG
      console.log(`addressMap size: ${addressMap.size}`)
      console.log(`addressMap keys: ${[...addressMap.keys()]}`) */
      if (addressMap.has(userAddress)) {
        console.log(`* Retrieved results from cache`)
        setResults(addressMap.get(userAddress))
        return;
      }
      const data = await trackPromise(alchemy.nft.getNftsForOwner(userAddress));    //userAddress);
      console.log(`* Went to network and read: ${data.ownedNfts.length} tokens`)
      setResults(data);   // Setting this here will cause the UI to update with initial information.  Down below
                          // call setResults again to update with more details

      const tokenDataPromises = [];

      for (let i = 0; i < data.ownedNfts.length; i++) {
        try {
          const tokenData = alchemy.core.getTokenMetadata(data.ownedNfts[i].contractAddress, data.ownedNfts[i].tokenId);
          tokenDataPromises.push(tokenData);
        } catch (e) {
          console.error(`error`)
        }
      }
      const tokenData = await trackPromise(Promise.all(tokenDataPromises));
      for (let i = 0; i < data.ownedNfts.length; i++) {
        data.ownedNfts[i] = { ...data.ownedNfts[i], ...tokenData[i] }
      }
      const newData = JSON.parse(JSON.stringify(data));
      // Because of the async nature we may hit this twice so guard for it
      if (!addressMap.has(userAddress)) {
        addressMap.set(userAddress, newData);
      }
      /* DEBUG
      console.log(`after setting ... addressMap size: ${addressMap.size}`)
      console.log(`after setting ... addressMap keys: ${[...addressMap.keys()]}`) */

      setResults(newData);   // React sees this as fresh object so will rerender
      return;
    } else {
      if (!isPublicKey(userAddress)) {
        resetResults();
        setShowIsAddrError(true);
        return;
      }
    }
  }

  const errMessage = showIsAddrError ? <p className="Error">Unknown .eth or address</p> : <span></span>;

  return (<div className="container">
    <ToastContainer/>
    <Flex color="white" flexDirection="column" borderWidth="1px" className="flexContainer">
      <Flex flexDirection="row" flexGrow="grow">
        <Heading mb={20} fontSize={36}>
          NFT Indexer
        </Heading>
        <Box alignSelf='right' padding='10px'>
          <ConnectButton/>
        </Box>
      </Flex>
      <Box>
        <Text>
          Connect a wallet. Or enter an address (or an ENS) and this website will return all of its NFT
          balances!
        </Text>
      </Box>
    </Flex>
    <Flex flexDirection="column">
      <Heading mt={42}>
        Get all the ERC-721 tokens (NFTs) at this address:
      </Heading>
      <Input
          onChange={(e) => {
            console.log(`changed addr: ${e.target.value}`)
            setUserAddress(e.target.value)
          }}
          color="black"
          w="600px"
          textAlign="left"
          p={4}
          bgColor="white"
          fontSize={24}
          value={userAddress}
          margin='20px'
      />
      {errMessage}
      <Box maxW="md">
        <Button fontSize={20} onClick={() => getNFTsForOwner(0)} mt={36} bgColor="blue">
          Fetch NFTs
        </Button>
      </Box>

      <Heading my={36}>NFTs</Heading>
      <LoadingIndicator/>

      {results.ownedNfts?.length > 0 ? (<SimpleGrid columns={4} spacing={24}>
        {results.ownedNfts.map((e, i) => {
          return (
              <Flex
                  flexDir={'column'}
                  key={e.contractAddress}
                  className="tokenBox"
              >
                <Box>
                  <b>Name:</b>{' '}
                  {e.title?.length === 0
                      ? 'No Name'
                      : e.title}
                </Box>
                <Image
                    src={
                        e.rawMetadata?.image ??
                        'https://via.placeholder.com/200'
                    }
                    alt={'Image'}
                />
              </Flex>);
        })}
      </SimpleGrid>) : ('Please make a query! This may take a few seconds...')}
    </Flex>
  </div>);
}

export default App;
