package io.intafaced.fix;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.stream.Collectors;

/**
 * stdin: one raw FIX message (SOH or '|'). stdout: JSON command or refuse.
 * This product includes software developed by quickfixengine.org (http://www.quickfixengine.org/).
 */
public final class FixAdapterMain {
    public static void main(String[] args) throws Exception {
        String raw = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))
                .lines()
                .collect(Collectors.joining("\n"));
        AdaptResult result = new FixGatewayAdapter().adapt(raw);
        System.out.print(result.toJson());
        if (!result.ok) {
            System.exit(2);
        }
    }
}
