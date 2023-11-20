import { TokenContract } from '@aztec/noir-contracts/types';
import {
    AccountWalletWithPrivateKey, AztecAddress, computeAuthWitMessageHash,
    Contract,
    createPXEClient, Fr,
    getSandboxAccountsWallets
} from '@aztec/aztec.js';
import { dexContract } from "./fixtures/dex";

const { PXE_URL = 'http://localhost:8080' } = process.env;


async function approve(token: Contract, ownerWallet: AccountWalletWithPrivateKey, agent: AztecAddress, amount: Number) {
    const nonce = Fr.random();
    const transfer = token.methods.transfer_public(
        ownerWallet.getAddress(),
        agent,
        amount,
        nonce
    );
    const messageHash = await computeAuthWitMessageHash(agent, transfer.request());
    await ownerWallet.setPublicAuth(messageHash, true).send().wait();

    return nonce
}

describe('deploy -> create pair -> swap', () => {
    const pxe = createPXEClient(PXE_URL);

    let ownerWallet: AccountWalletWithPrivateKey;
    let dex: Contract, zkb: Contract, usdt: Contract;

    it('set owner', async () => {
        [ownerWallet] = await getSandboxAccountsWallets(pxe);
    });

    it('deploy contracts', async () => {
        dex = await dexContract.deploy(ownerWallet, ownerWallet.getAddress()).send().deployed();
        zkb = await TokenContract.deploy(ownerWallet, ownerWallet.getAddress()).send().deployed();
        usdt = await TokenContract.deploy(ownerWallet, ownerWallet.getAddress()).send().deployed();
    });

    it('mint zkb and usdt to owner', async () => {
        await zkb.methods.mint_public(ownerWallet.getAddress(), 10000).send().wait()
        await usdt.methods.mint_public(ownerWallet.getAddress(), 500).send().wait()

        const zkbBalance = Number(await zkb.methods.balance_of_public(ownerWallet.getAddress()).view());
        const usdtBalance = Number(await usdt.methods.balance_of_public(ownerWallet.getAddress()).view());

        expect(zkbBalance).toBe(10000);
        expect(usdtBalance).toBe(500);
    });

    it('generate token transfer proofs, create token pair', async () => {
        const zkbNonce = Fr.random();
        let zkbBalance = Number(await zkb.methods.balance_of_public(ownerWallet.getAddress()).view());
        const zkbTransfer = zkb.methods.transfer_public(
            ownerWallet.getAddress(),
            dex.address,
            zkbBalance,
            zkbNonce
        );
        const zkbMessageHash = await computeAuthWitMessageHash(dex.address, zkbTransfer.request());
        await ownerWallet.setPublicAuth(zkbMessageHash, true).send().wait();

        const usdtNonce = Fr.random();
        let usdtBalance = Number(await usdt.methods.balance_of_public(ownerWallet.getAddress()).view());
        const usdtTransfer = usdt.methods.transfer_public(
            ownerWallet.getAddress(),
            dex.address,
            usdtBalance,
            usdtNonce
        );
        const usdtMessageHash = await computeAuthWitMessageHash(dex.address, usdtTransfer.request());
        await ownerWallet.setPublicAuth(usdtMessageHash, true).send().wait();

        await dex.methods.create(
            zkb.address,
            usdt.address,
            zkbBalance,
            usdtBalance,
            zkbNonce,
            usdtNonce
        ).send().wait();

        zkbBalance = Number(await zkb.methods.balance_of_public(ownerWallet.getAddress()).view());
        usdtBalance = Number(await usdt.methods.balance_of_public(ownerWallet.getAddress()).view());

        expect(zkbBalance).toBe(0);
        expect(usdtBalance).toBe(0);

        zkbBalance = Number(await zkb.methods.balance_of_public(dex.address).view());
        usdtBalance = Number(await usdt.methods.balance_of_public(dex.address).view());

        expect(zkbBalance).toBe(10000);
        expect(usdtBalance).toBe(500);
    });

    it('mint zkb to owner', async () => {
        await zkb.methods.mint_public(ownerWallet.getAddress(), 5000).send().wait()
        const zkbBalance = Number(await zkb.methods.balance_of_public(ownerWallet.getAddress()).view());
        expect(zkbBalance).toBe(5000);
    });

    it('swap zkb for usdt', async () => {
        let zkbContractBalance = Number(await zkb.methods.balance_of_public(dex.address).view());
        let usdtContractBalance = Number(await usdt.methods.balance_of_public(dex.address).view());
        let contractReserves = await dex.methods.get_reserves().view();

        expect(zkbContractBalance).toBe(10000);
        expect(Number(contractReserves[0])).toBe(10000);
        expect(usdtContractBalance).toBe(500);
        expect(Number(contractReserves[1])).toBe(500);

        let zkbOwnerBalance = Number(await zkb.methods.balance_of_public(ownerWallet.getAddress()).view());
        const nonce = await approve(zkb, ownerWallet, dex.address, zkbOwnerBalance);
        await dex.methods.swap(
            zkb.address,
            zkbOwnerBalance,
            nonce
        ).send().wait();

        zkbContractBalance = Number(await zkb.methods.balance_of_public(dex.address).view());
        usdtContractBalance = Number(await usdt.methods.balance_of_public(dex.address).view());
        contractReserves = await dex.methods.get_reserves().view();

        expect(zkbContractBalance).toBe(15000);
        expect(Number(contractReserves[0])).toBe(15000);
        expect(usdtContractBalance).toBe(333);
        expect(Number(contractReserves[1])).toBe(333);

        zkbOwnerBalance = Number(await zkb.methods.balance_of_public(ownerWallet.getAddress()).view());
        let usdtOwnerBalance = Number(await usdt.methods.balance_of_public(ownerWallet.getAddress()).view());
        expect(zkbOwnerBalance).toBe(0);
        expect(usdtOwnerBalance).toBe(167);
    });

    it('swap usdt for zkb', async () => {
        let zkbContractBalance = Number(await zkb.methods.balance_of_public(dex.address).view());
        let usdtContractBalance = Number(await usdt.methods.balance_of_public(dex.address).view());
        let contractReserves = await dex.methods.get_reserves().view();

        expect(zkbContractBalance).toBe(15000);
        expect(Number(contractReserves[0])).toBe(15000);
        expect(usdtContractBalance).toBe(333);
        expect(Number(contractReserves[1])).toBe(333);

        let usdtOwnerBalance = Number(await usdt.methods.balance_of_public(ownerWallet.getAddress()).view());
        const nonce = await approve(usdt, ownerWallet, dex.address, usdtOwnerBalance);
        await dex.methods.swap(
            usdt.address,
            usdtOwnerBalance,
            nonce
        ).send().wait();

        zkbContractBalance = Number(await zkb.methods.balance_of_public(dex.address).view());
        usdtContractBalance = Number(await usdt.methods.balance_of_public(dex.address).view());
        contractReserves = await dex.methods.get_reserves().view();

        expect(zkbContractBalance).toBe(10000);
        expect(Number(contractReserves[0])).toBe(10000);
        expect(usdtContractBalance).toBe(500);
        expect(Number(contractReserves[1])).toBe(500);

        let zkbOwnerBalance = Number(await zkb.methods.balance_of_public(ownerWallet.getAddress()).view());
        usdtOwnerBalance = Number(await usdt.methods.balance_of_public(ownerWallet.getAddress()).view());
        expect(usdtOwnerBalance).toBe(0);
        expect(zkbOwnerBalance).toBe(5000);
    });
});