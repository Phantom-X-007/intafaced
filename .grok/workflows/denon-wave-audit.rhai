let meta = #{
    name: "denon-wave-audit",
    description: "Delta audit after a Denon merge wave: inventory change, money/auth/deploy risk, structured findings",
    phases: [
        #{ title: "Delta", detail: "commits and surfaces since baseline SHA" },
        #{ title: "Risk layers", detail: "parallel money, auth, deploy judgment" },
        #{ title: "Synthesize", detail: "P0 list for orchestrator" },
    ],
};

let findings_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["id", "severity", "title", "evidence"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "title": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                },
            },
        },
    },
};

let since_sha = if args == () { () } else { args.since_sha };
if since_sha == () {
    pause("verification", "Pass args.since_sha — last peace-of-mind baseline commit SHA.");
}

let root = if args == () { () } else { args.worktree };
let root_s = if root == () { "REPO_ROOT" } else { root };

phase("Delta");
let delta = agent(
    "Read-only. Worktree root: " + root_s + ". List commits and major path changes since git SHA " + since_sha +
    " using git log and git diff --stat. Summarize new services, routers, money paths, deploy files, vendor. " +
    "Return plain markdown inventory. Use tools; do not invent.",
    #{ label: "delta-inventory", capability_mode: "read-only" },
);

phase("Risk layers");
let layers = [
    "money paths and ledger recipes",
    "auth publicProcedure ownership internal routes",
    "deploy edge ports compose Dockerfile brand-scan",
];
let jobs = [];
for layer in layers {
    let p = "Read-only audit of INTAFACED at " + root_s + " for DELTA since " + since_sha +
        ". Focus ONLY on: " + layer +
        ". Use git diff " + since_sha + "..HEAD and read changed files. Report at most 12 findings " +
        "as {id, severity (P0|P1|P2|P3), title, evidence file:line}. Empty list only after reading the diff.";
    jobs.push(#{
        prompt: p,
        label: "layer:" + layer,
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
}
let results = parallel(jobs);

let all = [];
for r in results {
    if r != () && r.success && r.output.findings != () {
        for f in r.output.findings {
            all.push(f);
        }
    }
}

phase("Synthesize");
let synth = agent(
    "You merge wave-audit findings for Nitro (non-technical). Input findings JSON: " +
    json_encode(all) +
    ". Delta context may be incomplete; prefer fail closed. Produce markdown: verdict one line, " +
    "P0 list, P1 list, clean notes, next fix order. No code dumps.",
    #{ label: "synthesize", capability_mode: "read-only" },
);

let report = if synth != () && synth.success { synth.output } else { "Synthesis failed — inspect layer findings." };
let path = write_scratch_file("wave-audit-report.md", report);
complete(#{ path: path, finding_count: all.len(), delta_ok: delta != () && delta.success });
