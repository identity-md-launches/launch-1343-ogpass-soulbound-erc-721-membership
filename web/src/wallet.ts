import { useEffect, useRef, useState } from "react";
import {
  createWalletClient,
  custom,
  erc20Abi,
  getAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import type { Club } from "./chain";
import type { ActionPort } from "./actions";
export type InjectedProvider = EIP1193Provider & {
  removeListener?: (event: string, fn: (value: unknown) => void) => void;
  on?: (event: string, fn: (value: unknown) => void) => void;
};
export interface WalletInfo {
  info: { uuid: string; name: string; rdns: string };
  provider: InjectedProvider;
}
export function useWallet() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [selected, setSelected] = useState<WalletInfo>();
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const sequence = useRef(0);
  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<WalletInfo>).detail;
      if (!detail?.provider?.request || !detail?.info?.uuid) return;
      setWallets((list) =>
        list.some((w) => w.info.uuid === detail.info.uuid)
          ? list
          : [...list, detail],
      );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const legacy = (window as Window & { ethereum?: InjectedProvider })
      .ethereum;
    if (legacy)
      setWallets((list) =>
        list.length
          ? list
          : [
              {
                info: {
                  uuid: "legacy",
                  name: "Browser wallet",
                  rdns: "injected",
                },
                provider: legacy,
              },
            ],
      );
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  useEffect(() => {
    if (!selected) return;
    const accounts = (value: unknown) => {
      sequence.current++;
      const list = value as string[];
      setAddress(list[0] ? getAddress(list[0]) : undefined);
    };
    const chain = (value: unknown) => {
      sequence.current++;
      setChainId(Number(value));
    };
    const disconnect = () => {
      sequence.current++;
      setAddress(undefined);
      setSelected(undefined);
      setChainId(undefined);
    };
    selected.provider.on?.("accountsChanged", accounts);
    selected.provider.on?.("chainChanged", chain);
    selected.provider.on?.("disconnect", disconnect);
    return () => {
      selected.provider.removeListener?.("accountsChanged", accounts);
      selected.provider.removeListener?.("chainChanged", chain);
      selected.provider.removeListener?.("disconnect", disconnect);
    };
  }, [selected]);
  async function connect(wallet: WalletInfo) {
    const id = ++sequence.current;
    const accounts = await wallet.provider.request({
      method: "eth_requestAccounts",
    });
    const chain = await wallet.provider.request({ method: "eth_chainId" });
    if (id !== sequence.current) return;
    if (!accounts[0])
      throw new Error(
        "No account was selected. Open your wallet and try again.",
      );
    setSelected(wallet);
    setAddress(getAddress(accounts[0]));
    setChainId(Number(chain));
  }
  async function switchChain() {
    await selected?.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    });
    const chain = await selected?.provider.request({ method: "eth_chainId" });
    setChainId(Number(chain));
  }
  function disconnect() {
    sequence.current++;
    setSelected(undefined);
    setAddress(undefined);
    setChainId(undefined);
  }
  return {
    wallets,
    sessionVersion: () => sequence.current,
    selected,
    address,
    chainId,
    connect,
    switchChain,
    disconnect,
  };
}
export async function assertWallet(
  provider: InjectedProvider,
  address: Address,
) {
  const [accounts, chain] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  if (Number(chain) !== 1)
    throw new Error("Switch your wallet to Ethereum mainnet and try again.");
  if (!accounts[0] || accounts[0].toLowerCase() !== address.toLowerCase())
    throw new Error(
      "The wallet account changed. Review the quote with your current account.",
    );
}
export function actionPort(
  club: Club,
  provider: InjectedProvider,
  address: Address,
  status: ActionPort["status"],
  sessionIsCurrent: () => boolean,
): ActionPort {
  const wallet = createWalletClient({
    account: address,
    chain: mainnet,
    transport: custom(provider),
  });
  async function guard() {
    if (!club.verified)
      throw new Error("Deployment is not verified. Refresh chain data.");
    if (!sessionIsCurrent())
      throw new Error(
        "The wallet session changed. Reconnect and review the action again.",
      );
    await assertWallet(provider, address);
    if (!sessionIsCurrent())
      throw new Error(
        "The wallet session changed. Reconnect and review the action again.",
      );
  }
  return {
    account: address,
    now: () => Date.now(),
    status,
    guard,
    read: (name, args) => club.read(name, args),
    allowance: () =>
      club.rpc.readContract({
        address: club.og,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, club.address],
      }),
    approve: async (amount) => {
      await guard();
      const { request } = await club.rpc.simulateContract({
        account: address,
        address: club.og,
        abi: erc20Abi,
        functionName: "approve",
        args: [club.address, amount],
      });
      await guard();
      return wallet.writeContract(request);
    },
    write: async (name, args) => {
      const { request } = await club.rpc.simulateContract({
        account: address,
        address: club.address,
        abi: club.abi,
        functionName: name,
        args,
      });
      await guard();
      return wallet.writeContract(request);
    },
    wait: async (hash: Hex) => {
      const r = await club.rpc.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180000,
      });
      if (r.status !== "success")
        throw new Error(
          "The transaction reverted. Refresh the quote; your wallet still pays the network fee.",
        );
    },
  };
}
