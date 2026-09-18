package io.intafaced.sbe;

import java.nio.charset.StandardCharsets;

/**
 * stdin: JSON with decimal-string qty/price. stdout: encode/decode JSON or refuse.
 * Uses Real Logic SBE 1.39.0 generated stubs. Not a book.
 */
public final class SbeCodecMain {
    public static void main(String[] args) throws Exception {
        // readAllBytes waits for EOF (Node spawnSync closes stdin after `input`).
        // Stream.lines() has hung the first Trade encode in CI past vitest's 5s.
        String raw = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        CodecResult result = new SbeCodec().handle(raw);
        System.out.print(result.json);
        if (!result.ok) {
            System.exit(2);
        }
    }
}
