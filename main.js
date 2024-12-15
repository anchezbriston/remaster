import { ApolloClient, InMemoryCache, gql } from "@apollo/client/core/core.cjs";
import * as ethers from "ethers";
import { BigNumber} from 'ethers';
import fs from "fs";
import { wait, sleep, random, readPrivateKeys, writeLineToFile } from './common.js'

fs.truncateSync('results.txt', 0);

const client = new ApolloClient({
  uri: 'https://api.cyberconnect.dev/profile/',
  cache: new InMemoryCache(),
});

const provider = new ethers.providers.JsonRpcProvider("https://rpc.ankr.com/eth");

const GET_NONCE = gql`
  mutation nonce($address: EVMAddress!) {
    nonce(request: {address: $address}) {
      status
      message
      data
    }
  }
`;

const LOGIN = gql`
    mutation login($request: LoginRequest!) {
        login(request: $request) {
            status
            message
            data {
                id
                privateInfo {
                  accessToken
                }
            }
        }
    }
`;

const CHECK_TOKENS = gql`
    query checkSeason1Eligibility {
        cyberRewardEligibility {
            total
            eligibility {
              type
              count
              detail {
                value
                amount
                chainId
                type
              }
            } 
        }
    }
`;

async function getTotalTokens(privateKey)
{
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = await wallet.getAddress();

    client.mutate({
      mutation: GET_NONCE,
      variables: {
        address: address,
      },
    }).then(async result => {
        let nonce = result.data.nonce.data;
        let issuedAt = new Date().toISOString();
        let expiredAt = new Date(BigNumber.from(Date.now().toString()).add(BigNumber.from(7.776 * 10**8)).toNumber()).toISOString();
        let message = `cyber.co wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Ethereum with CyberConnect\n\nURI: cyber.co\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiredAt}`;
        let flatSig = await wallet.signMessage(message);

        client.mutate({
          mutation: LOGIN,
          variables: {
            request: {
                address: address,
                signature: flatSig,
                signedMessage: message
            },
          },
        })
        .then(async result => {
            const accessToken = result.data.login.data.privateInfo.accessToken;

            client.query({
              query: CHECK_TOKENS,
              context: {
                headers: {
                  Authorization: accessToken ? `${accessToken}` : ""
                }
              }
            }).then(data => {
                const tokens = data.data.cyberRewardEligibility.total ? data.data.cyberRewardEligibility.total : 0;
                console.log(tokens);
                writeLineToFile('results.txt', `${address}: ${tokens ? Number(tokens) : 0}`);
            });
        });
    });
}

const privateKeys = readPrivateKeys('private_keys.txt')

for(let privateKey of privateKeys) {
    await getTotalTokens(privateKey);
    await sleep(0.5 * 1000);
}