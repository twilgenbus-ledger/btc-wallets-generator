import {Command} from 'commander';
import * as bip32 from 'bip32';
import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import got from 'got';
import {Payment} from "bitcoinjs-lib/types/payments";
import {getByteCount} from "./getByteCount";

type TestnetInfos = {
    "high_fee_per_kb": number,
    "medium_fee_per_kb": number,
    "low_fee_per_kb": number,
};

const opts = new Command();
const testnet = bitcoin.networks.testnet;

function getP2wpkhP2sh(node: bip32.BIP32Interface, network: bitcoin.networks.Network): Payment {
    return bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({pubkey: node.publicKey, network}),
        network,
    });
}

async function getTestnetInformation(): Promise<TestnetInfos> {
    const response = await got('https://api.blockcypher.com/v1/btc/test3', {
        responseType: 'json'
    });
    return response.body as TestnetInfos;
}

async function extractFaucetInfos(payment: Payment): Promise<{
    balance: number,
    unspent_outs: {
        hash: string;
        index: number;
        witnessUtxo: { script: Buffer; value: number };
        redeemScript: Buffer;
    }[],
}> {
    const response = await got(`https://testnet.blockchain.info/rawaddr/${payment.address}`, {
        responseType: 'json'
    });
    const body = response.body as any;
    return {
        balance: body.final_balance,
        unspent_outs: body?.txs.flatMap((tx: any) => {
            return tx.out.filter((out: any) => out.spent === false && out.addr === payment.address)
                .map((out: any) => {
                    return {
                        hash: tx.hash,
                        index: out.n,
                        witnessUtxo: {
                            script: Buffer.from(out.script, 'hex'),
                            value: out.value,
                        },
                        redeemScript: payment.redeem?.output,
                    };
                });
        })
    };
}

(async () => {
    opts.version('1.0.0')
        .description('Creates a BTC testnet BIP49 wallet.')
        .option('-n, --nb_addresses <nb_addresses>', 'Specify number of child addresses in wallet.', '10')
        .option('-f, --faucet_mnemonics <faucet_mnemonics>', 'Specify a faucet mnemonics from witch to get testnet coins (coins should be at index 0 of a BIP49 wallet).', 'barrel umbrella wide finger tackle eight summer build picnic abandon awkward rug oak claim shoulder')
        .option('-t, --transactions <transactions_per_address>', 'Specify number of transactions received on each child addresses.', '1');

    opts.parse(process.argv);

    const nbTransactions = +opts.transactions;
    const nbAddresses = +opts.nb_addresses;
    const faucetSeed = bip39.mnemonicToSeedSync(opts.faucet_mnemonics);

    let faucetRoot = bip32.fromSeed(faucetSeed, testnet);
    let faucetMainChild = faucetRoot.derivePath("m/49'/1'/0'/0/0");
    let faucetPayment = getP2wpkhP2sh(faucetMainChild, testnet);
    const faucetInfos = await extractFaucetInfos(faucetPayment);

    console.log("Checking balance...")
    if (faucetInfos.balance < nbAddresses * nbTransactions * 546) {
        console.error(`-> KO. (missing ${nbAddresses * nbTransactions * 546 - faucetInfos.balance} satoshis at address ${faucetPayment.address})`);
        process.exit();
    }
    console.log('-> OK');

    const mnemonic = bip39.generateMnemonic();
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const master = bip32.fromSeed(seed, testnet);

    const hardenedRoot = master.derivePath("m/49'/1'/0'");
    const testnetInfos = await getTestnetInformation();

    const children = [];
    for (let index = 0; index < nbAddresses; index++) {
        // Create child
        const child = hardenedRoot.derive(0).derive(index);
        children.push(getP2wpkhP2sh(child, testnet));
    }
    // Forge and send opts.transactions to child
    let psbt = new bitcoin.Psbt({network: testnet});

    // Add all inputs
    faucetInfos.unspent_outs.forEach(utxo => {
        psbt.addInput(utxo);
    });

    children.forEach(childP2sh => {
        for (let transactionIdx = 0; transactionIdx < +nbTransactions; transactionIdx++) {
            psbt.addOutput({
                address: childP2sh.address as string,
                value: 546,
            })
        }
    });
    // Manually calculate fees to prevent consuming too much from the faucet
    const fees = Math.round(
        getByteCount({P2PKH: faucetInfos.unspent_outs.length}, {P2PKH: children.length})
        * testnetInfos.low_fee_per_kb / 1000
    ) + 100;

    const remainingBalance = faucetInfos.balance - (546 * children.length * +nbTransactions) - fees;
    psbt.addOutput({
        address: faucetPayment.address as string,
        value: remainingBalance,
    }).signAllInputs(
        bitcoin.ECPair.fromPrivateKey(faucetMainChild.privateKey as Buffer)
    ).finalizeAllInputs();
    const rawHex = psbt.extractTransaction().toHex();
    console.log(`\nCreated BTC wallet (mnemonic=[${mnemonic}]) with:
- addresses: ${JSON.stringify(children.map(child => child.address))}
- each one will receive ${nbTransactions} transactions`);
    console.log("Remaining balance in faucet wallet: ", remainingBalance)
    console.log("\nTransaction to send funds to child: ", rawHex);
})();
