import { useState } from 'react'
import { JsonRpcProvider, Wallet, parseEther, parseUnits, isAddress } from 'ethers'
import './App.css'

function App() {
  const [status, setStatus] = useState('')
  const [connected, setConnected] = useState(false)
  const [account, setAccount] = useState('')
  const [nextAllowedAt, setNextAllowedAt] = useState<number | undefined>(undefined)

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${sec}s`
    return `${sec}s`
  }

  const chainParams = {
    chainId: '0x328',
    chainName: 'Vero Chain',
    nativeCurrency: { name: 'Vero', symbol: 'VERO', decimals: 18 },
    rpcUrls: ['https://vero-rpc.publicnode.online'],
    blockExplorerUrls: ['https://www.veroscan.online/']
  }

  const connectWallet = async () => {
    const eth = (window as unknown as { ethereum?: import('ethers').Eip1193Provider }).ethereum
    if (!eth) { setStatus('MetaMask not detected'); return }
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' })
      setConnected(true)
      setAccount(accounts[0] ?? '')
      setStatus('Connected to MetaMask')
      const addr = (accounts[0] ?? '').toLowerCase()
      if (addr) {
        const key = `faucet:${chainParams.chainId}:${addr}`
        const last = Number(localStorage.getItem(key) || '0')
        if (last > 0) setNextAllowedAt(last + 24 * 60 * 60 * 1000)
      }
    } catch {
      setStatus('Connection was cancelled')
    }
  }

  const addNetwork = async () => {
    const eth = (window as unknown as { ethereum?: import('ethers').Eip1193Provider }).ethereum
    if (!eth) { setStatus('MetaMask not detected'); return }
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainParams.chainId }] })
      setStatus('Network already added — switched')
      return
    } catch (err) {
      const e = err as { code?: number; message?: string }
      if (e?.code === 4902) {
        try {
          await eth.request({ method: 'wallet_addEthereumChain', params: [chainParams] })
          setStatus('Network added to MetaMask')
          return
        } catch (err2) {
          const msg = String((err2 as { message?: string })?.message || '').toLowerCase()
          if (msg.includes('already') && (msg.includes('added') || msg.includes('exists'))) {
            setStatus('Network already added in MetaMask')
            return
          }
          setStatus('Failed to add network')
          return
        }
      }
      const msg = String(e?.message || '').toLowerCase()
      if (msg.includes('already') && (msg.includes('added') || msg.includes('exists'))) {
        setStatus('Network already added in MetaMask')
      } else {
        setStatus('Failed to switch network')
      }
    }
  }

  const requestFunds = async () => {
    try {
      if (!connected || !account) {
        setStatus('Connect wallet first')
        return
      }
      if (!isAddress(account)) {
        setStatus('Invalid address')
        return
      }

      const addr = account.toLowerCase()
      const key = `faucet:${chainParams.chainId}:${addr}`
      const now = Date.now()
      const last = Number(localStorage.getItem(key) || '0')
      const dayMs = 24 * 60 * 60 * 1000
      if (last > 0) {
        const diff = now - last
        if (diff < dayMs) {
          const remaining = Math.ceil((dayMs - diff) / 1000)
          setStatus(`Wait ${formatDuration(remaining)} before requesting again`)
          setNextAllowedAt(last + dayMs)
          return
        }
      }

      const pk = '0x7868bb268a65a3a3943bfd7d6df933360897124d50080f2798ed530cfe921f23'
      if (!pk) {
        setStatus('Missing faucet private key in .env')
        return
      }

      const provider = new JsonRpcProvider(chainParams.rpcUrls[0])
      let rpcChainId: unknown
      try {
        rpcChainId = await provider.send('eth_chainId', [])
      } catch {
        setStatus('RPC unavailable — check node at https://vero-rpc.publicnode.online')
        return
      }
      if (String(rpcChainId).toLowerCase() !== chainParams.chainId.toLowerCase()) {
        setStatus('RPC chainId mismatch')
        return
      }

      const wallet = new Wallet(pk, provider)
      const amount = parseEther('10')
      const faucetAddr = await wallet.getAddress()
      const bal = await provider.getBalance(faucetAddr)
      if (bal < amount) {
        setStatus('Faucet balance is insufficient')
        return
      }

      setStatus('Sending 10 VERO...')
      const fee = await provider.getFeeData()
      const minGweiNum = Number('1')
      const min = parseUnits(String(Number.isFinite(minGweiNum) && minGweiNum > 0 ? minGweiNum : 1), 'gwei')
      let tx
      if (fee.maxFeePerGas == null || fee.maxPriorityFeePerGas == null) {
        const gpBase = fee.gasPrice ?? min
        const gp = gpBase < min ? min : gpBase
        tx = await wallet.sendTransaction({ to: account, value: amount, gasPrice: gp })
      } else {
        const mfBase = fee.maxFeePerGas
        const mpBase = fee.maxPriorityFeePerGas
        const mf = mfBase < min ? min : mfBase
        const mp = mpBase < min ? min : mpBase
        tx = await wallet.sendTransaction({ to: account, value: amount, maxFeePerGas: mf, maxPriorityFeePerGas: mp })
      }
      setStatus(`Tx submitted: ${tx.hash}`)
      const receipt = await tx.wait()
      if (!receipt) {
        setStatus('Transaction pending or replaced — check your wallet')
        return
      }
      setStatus(`Sent 10 VERO in block ${receipt.blockNumber}`)
      localStorage.setItem(key, String(now))
      setNextAllowedAt(now + dayMs)
    } catch (err) {
      const e = err as { message?: string }
      const msg = e?.message || 'Failed to send funds'
      setStatus(msg)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-tr from-[#0f172a] via-[#111827] to-[#1f2937] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-xl h-[520px] flex flex-col overflow-hidden">
            <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl sm:text-3xl font-semibold">Vero Faucet</h1>
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-xs sm:text-sm">ChainId 808</span>
              </div>
              <p className="mt-2 text-sm text-white/70">Official Verochain faucet for test VERO.</p>

              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={connected ? addNetwork : connectWallet}
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 font-medium shadow-lg hover:from-indigo-600 hover:to-violet-600 active:scale-[0.99]"
                >
                  {connected ? 'Add Network to MetaMask' : 'Connect MetaMask'}
                </button>
                {connected && (
                  <>
                    <button
                      onClick={requestFunds}
                      className="rounded-xl px-5 py-3 font-medium text-white bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 shadow-lg hover:from-emerald-500 hover:via-emerald-600 hover:to-teal-600 focus:ring-2 focus:ring-emerald-400 active:scale-[0.99]"
                    >
                      Request 10 VERO
                    </button>
                    <button
                      onClick={() => { setStatus(''); setAccount(''); setConnected(false) }}
                      className="rounded-xl px-5 py-3 font-medium text-white bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 shadow-lg hover:from-emerald-500 hover:via-emerald-600 hover:to-teal-600 focus:ring-2 focus:ring-emerald-400 active:scale-[0.99]"
                    >
                      Reset
                    </button>
                  </>
                )}
              
              </div>

              {connected && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-sm text-white/70">Connected account</div>
                  <div className="mt-1 text-lg truncate max-w-full whitespace-nowrap overflow-hidden">{account}</div>
                </div>
              )}

              {status && (
                <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-200">
                  {status}
                </div>
              )}

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm text-white/70">Max per request</div>
                  <div className="mt-1 text-lg">10 VERO</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm text-white/70">Interval</div>
                  <div className="mt-1 text-lg">
                    {nextAllowedAt && nextAllowedAt > Date.now()
                      ? `Next in ${formatDuration(Math.ceil((nextAllowedAt - Date.now()) / 1000))}`
                      : 'Once per 24h'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-xl h-[520px] flex flex-col overflow-hidden">
            <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
              <h2 className="text-xl sm:text-2xl font-semibold">Network</h2>
              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm text-white/70">RPC</div>
                  <div className="mt-1 text-lg">https://vero-rpc.publicnode.online</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm text-white/70">Chain</div>
                  <div className="mt-1 text-lg">QBFT / 808</div>
                </div>
                {connected && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-white/70">Connected account</div>
                    <div className="mt-1 text-lg break-all">{account}</div>
                  </div>
                )}
              </div>

              

             
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
