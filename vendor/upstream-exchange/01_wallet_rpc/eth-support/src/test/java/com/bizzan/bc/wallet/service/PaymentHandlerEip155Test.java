package com.bizzan.bc.wallet.service;

import org.junit.Test;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.Credentials;
import org.web3j.crypto.RawTransaction;
import org.web3j.crypto.Sign;
import org.web3j.crypto.TransactionEncoder;
import org.web3j.utils.Numeric;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Known-answer fixtures for the EIP-155 withdrawal signing path.
 *
 * <h2>Why exact bytes and not "it did not throw"</h2>
 *
 * A test that only asserts a signature was produced proves nothing about a
 * signature. Adding a chain id changes the RLP payload that gets hashed and
 * folds the id into v, so the only assertion worth making on a withdrawal path
 * is the whole signed transaction, byte for byte, against a value this codebase
 * did not produce.
 *
 * <h2>Where the expected values come from</h2>
 *
 * <ul>
 *   <li>{@link #ETH_CHAIN_1} is the signed transaction published in <b>EIP-155
 *       itself</b>, for its own worked example: private key
 *       0x4646...46, nonce 9, gasPrice 20 gwei, gasLimit 21000, recipient
 *       0x3535...35, value 1 ether, chain id 1. It is a specification
 *       constant, not a recording of any implementation.</li>
 *   <li>Every other expected value was produced by <b>viem 2.55.8</b> — a
 *       different implementation, in a different language, from a different
 *       codebase — driven with the identical inputs. viem reproduces the EIP-155
 *       published vector exactly, which is what licenses using it as the oracle
 *       for the cases the EIP does not cover.</li>
 * </ul>
 *
 * None of them is a recording of what web3j 3.3.1 does. If web3j and viem ever
 * disagreed, these assertions are on viem's side and the build goes red, which
 * is the point.
 *
 * <h2>The ceiling</h2>
 *
 * web3j 3.3.1 takes the chain id as a {@code byte} and computes
 * {@code v = (byte)(recoveryV + (chainId << 1) + 8)}, truncating the RESULT.
 * The truncation is invisible for any v in 0..255, because
 * {@code RlpString.create(byte)} stores the raw byte and RLP reads bytes
 * unsigned — so chain id 46 giving v = (byte)128 = -128 encodes as 0x80 and
 * reads back as 128, correctly. The ceiling is where the true v stops fitting in
 * eight bits at all: 109 is the last chain id that always works, and 110 is
 * valid for recovery id 0 and malformed for recovery id 1.
 * {@link #ceilingPlusOneIsNotConservatism_theLibraryReallyTruncatesV} proves
 * that against the library rather than asserting it in a comment.
 */
public class PaymentHandlerEip155Test {

    // ── Fixture inputs. Fixed, and they are inputs to a specification example,
    //    so they must never be "improved". ────────────────────────────────────

    /** The private key from the EIP-155 worked example. A published test key. */
    private static final String KEY = "4646464646464646464646464646464646464646464646464646464646464646";

    /**
     * A second key, chosen because it is the one that exposes the ceiling: at
     * chain id 110 it signs with recovery id 1, which is the half that breaks.
     */
    private static final String KEY_RECOVERY_ID_1_AT_110 =
            "2222222222222222222222222222222222222222222222222222222222222222";

    /**
     * The recipient from the EIP-155 worked example. Twenty 0x35 bytes — it is
     * the ASCII string "5555555555555555555555555555555555555555" read as hex,
     * chosen by the EIP precisely because it is obviously not anybody's account.
     * No key exists for it and nothing is at it on any chain.
     */
    private static final String TO = "0x3535353535353535353535353535353535353535";

    private static final BigInteger NONCE = BigInteger.valueOf(9);
    private static final BigInteger GAS_PRICE = new BigInteger("20000000000");
    private static final BigInteger GAS_LIMIT_ETHER = BigInteger.valueOf(21000);
    private static final BigInteger GAS_LIMIT_TOKEN = BigInteger.valueOf(60000);
    private static final BigInteger ONE_ETHER = new BigInteger("1000000000000000000");
    private static final BigInteger TOKEN_AMOUNT = BigInteger.valueOf(1000000);

    // ── Expected outputs ─────────────────────────────────────────────────────

    /** EIP-155's own published signed transaction. v = 0x25 = 37 = 2*1 + 35. */
    private static final String ETH_CHAIN_1 =
            "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a7640000"
                    + "8025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276"
                    + "a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83";

    /**
     * BSC. v = 0x8194 → 148 = 2*56 + 36, i.e. recovery id 1 at a chain id whose
     * v does not fit in a SIGNED byte. It is in this suite because it is the
     * case that decides the ceiling: if the byte parameter capped usable chain
     * ids at 45, this vector could not exist. It does, and web3j reproduces it.
     */
    private static final String ETH_CHAIN_56 =
            "0xf86d098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a7640000"
                    + "808194a007764d8e7d4ce45afb36cb2f5bec741f96eee3b8f23304e4d35b0f389912e7f7"
                    + "a047c14849f32c33c269dec152d168ddeca152fec8ceeb7369177ff3a06dc72c48";

    /** The ceiling. v = 0x81fe → 254 = 2*109 + 36, the largest v that fits. */
    private static final String ETH_CHAIN_109 =
            "0xf86d098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a7640000"
                    + "8081fea0918c3236069d8f7fe2545bd3f16c5706c1c22fe33c1ca89b94912f12fb46ecf9"
                    + "a04ab38925f65cf469c63b51cebf724333618771be4d0042f4c7f869fa224aa136";

    /**
     * What this tree signed before this change: no chain id, v = 0x1b = 27.
     * Present so the suite proves the fix TOOK EFFECT rather than passing
     * vacuously. It is a literal rather than a call to the two-argument
     * overload on purpose — that overload is what
     * tooling/ci/wallet-rpc-mainnet-scan.mjs rule M3 bans from this tree, and a
     * test is not an exemption from a ban whose whole subject is this file.
     */
    private static final String ETH_PRE_EIP155 =
            "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a7640000"
                    + "801ba08383adc8b8ae116f918fb44ca7ff9dfd8012596a5c130c6246a2cc717ba41cda"
                    + "a053ddfacf5bd4aa7e46d1575acf52636ea659b91f29e2fb91c75567a279738f38";

    /** ERC-20 transfer(0x3535...35, 1000000) to contract 0x3535...35, chain 1. */
    private static final String TOKEN_CHAIN_1 =
            "0xf8a9098504a817c80082ea6094353535353535353535353535353535353535353580b844a9059cbb"
                    + "0000000000000000000000003535353535353535353535353535353535353535"
                    + "00000000000000000000000000000000000000000000000000000000000f4240"
                    + "25a028120bf790930156e9b97d77e1bc2809eba905b7e024226d2ee4859d79522acb"
                    + "a07e5300a8ec22c39e88bb0225458142e89dbc3ccc40de2f70a4cd6cc3820cab8b";

    /** The same ERC-20 transfer on BSC. v = 0x8194 = 148. */
    private static final String TOKEN_CHAIN_56 =
            "0xf8aa098504a817c80082ea6094353535353535353535353535353535353535353580b844a9059cbb"
                    + "0000000000000000000000003535353535353535353535353535353535353535"
                    + "00000000000000000000000000000000000000000000000000000000000f4240"
                    + "8194a03ae5613596ba8bb465a32d6932e24cfe6d6ea83aa9415fe109794890489f2eac"
                    + "a020f9520ea2c81787837226721c3f5e0f55f13d8e506bd1a8a818f8b0f14f0365";

    /** The same ERC-20 transfer at the ceiling. v = 0x81fd → 253 = 2*109 + 35. */
    private static final String TOKEN_CHAIN_109 =
            "0xf8aa098504a817c80082ea6094353535353535353535353535353535353535353580b844a9059cbb"
                    + "0000000000000000000000003535353535353535353535353535353535353535"
                    + "00000000000000000000000000000000000000000000000000000000000f4240"
                    + "81fda0ddbacecefba9e8eb76a793e441684f2b0c795635aa9d44f258a60a4b35242ada"
                    + "a066b17a35ddf9b991b43eb5b0490e12c10fd9a6da0599f49d4b3d86463d915eb5";

    /**
     * The correct signature at chain id 110 for the key that lands on recovery
     * id 1 there — v = 0x820100 → 256. web3j CANNOT produce this; the assertion
     * below is that it does not, and that the guard refuses the chain id.
     */
    private static final String ETH_CHAIN_110_CORRECT =
            "0xf86e098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a7640000"
                    + "80820100a0487feb76867165102c8fbade93a1d16d5f85a5055d6093bb571fc96d10f010b7"
                    + "a043910237b7d79053b76eb8c2c5046f72a7323993a2760be32740c6296b6afad9";

    private static RawTransaction etherTransaction() {
        return RawTransaction.createEtherTransaction(NONCE, GAS_PRICE, GAS_LIMIT_ETHER, TO, ONE_ETHER);
    }

    private static RawTransaction tokenTransaction() {
        Function fn = new Function(
                "transfer",
                Arrays.asList(new Address(TO), new Uint256(TOKEN_AMOUNT)),
                Collections.<TypeReference<?>> emptyList());
        return RawTransaction.createTransaction(NONCE, GAS_PRICE, GAS_LIMIT_TOKEN, TO, FunctionEncoder.encode(fn));
    }

    // ── The known-answer assertions ──────────────────────────────────────────

    /**
     * The one that anchors everything else: our signing path, on the EIP's own
     * inputs, must produce the EIP's own published bytes.
     */
    @Test
    public void etherWithdrawalAtChainId1MatchesThePublishedEip155Vector() {
        assertEquals(ETH_CHAIN_1, PaymentHandler.signToHex(etherTransaction(), 1L, Credentials.create(KEY)));
    }

    @Test
    public void etherWithdrawalAtChainId56MatchesTheIndependentVector() {
        assertEquals(ETH_CHAIN_56, PaymentHandler.signToHex(etherTransaction(), 56L, Credentials.create(KEY)));
    }

    @Test
    public void etherWithdrawalAtTheCeilingMatchesTheIndependentVector() {
        assertEquals(
                ETH_CHAIN_109,
                PaymentHandler.signToHex(etherTransaction(), PaymentHandler.MAX_EIP155_CHAIN_ID, Credentials.create(KEY)));
    }

    @Test
    public void tokenWithdrawalAtChainId1MatchesTheIndependentVector() {
        assertEquals(TOKEN_CHAIN_1, PaymentHandler.signToHex(tokenTransaction(), 1L, Credentials.create(KEY)));
    }

    @Test
    public void tokenWithdrawalAtChainId56MatchesTheIndependentVector() {
        assertEquals(TOKEN_CHAIN_56, PaymentHandler.signToHex(tokenTransaction(), 56L, Credentials.create(KEY)));
    }

    @Test
    public void tokenWithdrawalAtTheCeilingMatchesTheIndependentVector() {
        assertEquals(
                TOKEN_CHAIN_109,
                PaymentHandler.signToHex(tokenTransaction(), PaymentHandler.MAX_EIP155_CHAIN_ID, Credentials.create(KEY)));
    }

    /**
     * v is the whole observable point of EIP-155, so assert it directly rather
     * than only inside a 100-byte string comparison. The seventh RLP item of a
     * legacy transaction is v; here it is read positionally, which is safe
     * because every field before it is fixed by the fixture.
     */
    @Test
    public void vIsChainIdTimesTwoPlus35Or36() {
        assertEquals(2 * 1 + 35, vOf(ETH_CHAIN_1));
        assertEquals(2 * 56 + 36, vOf(ETH_CHAIN_56));
        assertEquals(2 * 109 + 36, vOf(ETH_CHAIN_109));
        // ...and the pre-EIP-155 form encodes the bare recovery value instead.
        assertEquals(27, vOf(ETH_PRE_EIP155));
    }

    /**
     * The change actually changed something. Without this, every assertion above
     * could in principle be satisfied by a fixture set recorded from the old
     * behaviour.
     */
    @Test
    public void theNewSignatureIsNotThePreEip155One() {
        String signed = PaymentHandler.signToHex(etherTransaction(), 1L, Credentials.create(KEY));
        assertNotEquals(ETH_PRE_EIP155, signed);
        assertEquals(ETH_CHAIN_1, signed);
        // And it differs in more than the v byte: EIP-155 changes the payload
        // that is hashed, so r and s move too. A "fix" that only rewrote v would
        // pass the string comparison above and still be signing the old digest.
        assertNotEquals(rOf(ETH_PRE_EIP155), rOf(signed));
    }

    // ── The refusal ──────────────────────────────────────────────────────────

    @Test
    public void anUnsetChainIdRefusesToSign() {
        expectRefusal(null, "coin.chain-id is not set");
    }

    /**
     * Zero is web3j's ChainId.NONE on later versions and -1 is the NONE constant
     * this jar actually ships. Both reproduce the defect being fixed, so both
     * are refused rather than passed through.
     */
    @Test
    public void aSentinelChainIdRefusesToSign() {
        expectRefusal(0L, "is not a chain id");
        expectRefusal(-1L, "is not a chain id");
    }

    @Test
    public void aChainIdPastTheCeilingRefusesToSign() {
        expectRefusal(PaymentHandler.MAX_EIP155_CHAIN_ID + 1, "cannot be signed correctly by web3j 3.3.1");
        expectRefusal(137L, "cannot be signed correctly by web3j 3.3.1");    // Polygon
        expectRefusal(17000L, "cannot be signed correctly by web3j 3.3.1");  // Holesky
        expectRefusal(42161L, "cannot be signed correctly by web3j 3.3.1");  // Arbitrum
        expectRefusal(11155111L, "cannot be signed correctly by web3j 3.3.1"); // Sepolia
    }

    /** The boundary is where it is claimed to be, from both sides. */
    @Test
    public void theCeilingItselfIsAccepted() {
        assertEquals((byte) 109, PaymentHandler.eip155ChainId(PaymentHandler.MAX_EIP155_CHAIN_ID));
        assertEquals((byte) 1, PaymentHandler.eip155ChainId(1L));
        assertEquals((byte) 56, PaymentHandler.eip155ChainId(56L));
    }

    /**
     * The ceiling is a measurement, not caution.
     *
     * <p>This bypasses the guard and calls web3j directly at chain id 110 with a
     * key that signs there with recovery id 1. The correct v is 256; web3j
     * truncates it to a single byte and emits ZERO. The resulting transaction
     * carries a real r and s and an unrecoverable v — a node cannot derive the
     * sender, so the withdrawal is not merely misrouted, it is malformed. The
     * same chain id with recovery id 0 works fine, which is precisely why this
     * must be refused and not documented: the failure is selected by the
     * signature nonce, so it would appear roughly every other withdrawal.
     */
    @Test
    public void ceilingPlusOneIsNotConservatism_theLibraryReallyTruncatesV() {
        Credentials creds = Credentials.create(KEY_RECOVERY_ID_1_AT_110);
        byte[] signed = TransactionEncoder.signMessage(etherTransaction(), (byte) 110, creds);
        String actual = Numeric.toHexString(signed);

        assertNotEquals("web3j reproduced the correct chain-110 signature - re-derive the ceiling",
                ETH_CHAIN_110_CORRECT, actual);
        assertEquals("the truncated v should be 0, not a plausible-looking chain id", 0, vOf(actual));
        // r and s are unaffected: it is only v that was lost.
        assertTrue(actual.contains("487feb76867165102c8fbade93a1d16d5f85a5055d6093bb571fc96d10f010b7"));

        // And the same chain id, with a key that lands on recovery id 0, comes
        // out correct - the half-validity, demonstrated in one test.
        String otherHalf = Numeric.toHexString(
                TransactionEncoder.signMessage(etherTransaction(), (byte) 110, Credentials.create(KEY)));
        assertEquals(2 * 110 + 35, vOf(otherHalf));

        // Both are refused anyway, because which half you get is not knowable in
        // advance.
        expectRefusal(110L, "cannot be signed correctly");
    }

    /**
     * Directly on the library's own arithmetic, so the boundary is pinned even
     * if the fixture transactions above are ever changed: v survives while the
     * true value fits in eight unsigned bits, and 2*109+36 = 254 is the last one
     * that does.
     */
    @Test
    public void theLibraryVArithmeticBreaksExactlyAboveTheCeiling() {
        for (byte recoveryV : new byte[] { 27, 28 }) {
            for (int chainId = 1; chainId <= (int) PaymentHandler.MAX_EIP155_CHAIN_ID; chainId++) {
                int expected = recoveryV + 2 * chainId + 8;
                assertEquals("chainId=" + chainId + " recoveryV=" + recoveryV,
                        expected, unsignedV(recoveryV, chainId));
            }
        }
        // 110 with recovery id 1 is the first true v that does not fit: 256.
        assertEquals(255, unsignedV((byte) 27, 110));
        assertEquals(0, unsignedV((byte) 28, 110));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** v as web3j would RLP-encode it, read back the way a node reads it: unsigned. */
    private static int unsignedV(byte recoveryV, int chainId) {
        Sign.SignatureData in = new Sign.SignatureData(recoveryV, new byte[32], new byte[32]);
        return TransactionEncoder.createEip155SignatureData(in, (byte) chainId).getV() & 0xff;
    }

    private static void expectRefusal(Long chainId, String expectedFragment) {
        try {
            PaymentHandler.signToHex(etherTransaction(), chainId, Credentials.create(KEY));
            fail("expected a refusal for chain id " + chainId + ", but it signed");
        } catch (IllegalStateException expected) {
            assertTrue("message was: " + expected.getMessage(),
                    expected.getMessage().contains(expectedFragment));
        }
    }

    /** The 32-byte r of a signed transaction: the second-to-last RLP item. */
    private static String rOf(String signedHex) {
        String hex = strip(signedHex);
        return hex.substring(hex.length() - 130, hex.length() - 66);
    }

    /**
     * The v of a signed legacy transaction, as a node reads it: unsigned.
     *
     * <p>Not a general RLP decoder — it only needs to work on the tail. r and s
     * are always 32-byte items, so they occupy the last {@code 2 * (2 + 64)}
     * hex characters, and v is the item that ends where they begin. v is then
     * one of exactly three RLP shapes, distinguished by its own header byte.
     */
    private static int vOf(String signedHex) {
        String hex = strip(signedHex);
        int end = hex.length() - 2 * (2 + 64);
        // Longest header first: 0x82 is unambiguous, and testing the single-byte
        // shape first would read the low half of a two-byte v as the whole of it
        // (chain 110's true v is 0x0100, whose low byte is 0x00).
        if (Integer.parseInt(hex.substring(end - 6, end - 4), 16) == 0x82) {
            return Integer.parseInt(hex.substring(end - 4, end), 16);    // 0x82 <two bytes>
        }
        if (Integer.parseInt(hex.substring(end - 4, end - 2), 16) == 0x81) {
            return Integer.parseInt(hex.substring(end - 2, end), 16);    // 0x81 <one byte >= 0x80>
        }
        int single = Integer.parseInt(hex.substring(end - 2, end), 16);
        if (single < 0x80) return single;                                // 0x00..0x7f is its own encoding
        throw new IllegalArgumentException("could not locate the v field in " + signedHex);
    }

    private static String strip(String hex) {
        return hex.startsWith("0x") ? hex.substring(2) : hex;
    }
}
