package io.intafaced.sbe;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.stream.Collectors;

/**
 * stdin: JSON with decimal-string qty/price. stdout: encode/decode JSON or refuse.
 * Uses Real Logic SBE 1.39.0 generated stubs. Not a book.
 */
public final class SbeCodecMain {
    public static void main(String[] args) {
        String raw = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))
                .lines()
                .collect(Collectors.joining("\n"));
        CodecResult result = new SbeCodec().handle(raw);
        System.out.print(result.json);
        if (!result.ok) {
            System.exit(2);
        }
    }
}
