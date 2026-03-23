#!/usr/bin/env node

/**
 * wic_data_fetcher.mjs
 * 
 * Simple CLI script that fetches raw GitHub Pull Requests and Issues
 * for specified profiles within a date range, along with active Bounty issues.
 * 
 * It performs NO EVALUATION or grading logic. It simply outputs a JSON
 * or Markdown payload for an AI Agent to evaluate against the Wic Assessment Guide.
 */

import { execFileSync } from "child_process";

// Helper: Run gh CLI command and parse JSON
function ghJson(args) {
    try {
        const out = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
        return JSON.parse(out);
    } catch (error) {
        console.error(`Error running gh ${args.join(" ")}:`, error.message);
        return null;
    }
}

function parseDateRange(argv) {
    const fromIdx = argv.indexOf("--from");
    const toIdx = argv.indexOf("--to");
    if (fromIdx === -1 || toIdx === -1) {
        console.error("Missing --from or --to (format YYYY-MM-DD)");
        process.exit(1);
    }
    return { from: argv[fromIdx + 1], to: argv[toIdx + 1] };
}

function parseProfiles(argv) {
    const idx = argv.indexOf("--profiles");
    if (idx === -1) {
        console.error("Missing --profiles (comma separated list of github logins)");
        process.exit(1);
    }
    return argv[idx + 1].split(",").map(s => s.trim());
}

function main() {
    const argv = process.argv.slice(2);
    const { from, to } = parseDateRange(argv);
    const profiles = parseProfiles(argv);
    const repoIdx = argv.indexOf("--repo");
    const repo = repoIdx !== -1 ? argv[repoIdx + 1] : "open-mercato/open-mercato";
    const formatIdx = argv.indexOf("--format");
    const format = formatIdx !== -1 ? argv[formatIdx + 1] : "json";

    const payload = {
        metadata: { repo, from, to, profiles, generatedAt: new Date().toISOString() },
        bounties: [],
        contributions: []
    };

    // 1. Fetch active/recent Bounties
    console.error(`[fetcher] Fetching bounties from ${repo}...`);
    // Search open and closed issues with "bounty" in title or label
    const openBounties = ghJson(["issue", "list", "-R", repo, "--search", "label:bounty in:title,label", "--state", "open", "--json", "number,title,body,createdAt,closedAt,labels"]);
    const closedBounties = ghJson(["issue", "list", "-R", repo, "--search", `label:bounty in:title,label closed:>=${from}`, "--state", "closed", "--json", "number,title,body,createdAt,closedAt,labels"]);

    if (openBounties) payload.bounties.push(...openBounties);
    if (closedBounties) payload.bounties.push(...closedBounties);

    // 2. Fetch Contributions (PRs & Issues) for each profile
    for (const profile of profiles) {
        console.error(`[fetcher] Fetching PRs for ${profile}...`);
        // Merged PRs
        const mergedQuery = encodeURIComponent(`repo:${repo} is:pr is:merged author:${profile} merged:${from}..${to}`);
        const mergedPrs = ghJson(["api", "-X", "GET", `search/issues?q=${mergedQuery}`]);

        // Unmerged/Updated PRs (for potential pre-approvals)
        const updatedQuery = encodeURIComponent(`repo:${repo} is:pr -is:merged author:${profile} updated:${from}..${to}`);
        const unmergedPrs = ghJson(["api", "-X", "GET", `search/issues?q=${updatedQuery}`]);

        console.error(`[fetcher] Fetching Issues for ${profile}...`);
        // Authored Issues
        const issueQuery = encodeURIComponent(`repo:${repo} is:issue author:${profile} created:${from}..${to}`);
        const issues = ghJson(["api", "-X", "GET", `search/issues?q=${issueQuery}`]);

        const items = [
            ...(mergedPrs?.items || []).map(i => ({ ...i, wicSourceType: "pull_request", merged: true })),
            ...(unmergedPrs?.items || []).map(i => ({ ...i, wicSourceType: "pull_request", merged: false })),
            ...(issues?.items || []).map(i => ({ ...i, wicSourceType: "issue" }))
        ];

        for (const item of items) {
            // get files changed for PRs
            let files = [];
            let additions = 0, deletions = 0, changedFiles = 0;

            if (item.wicSourceType === "pull_request") {
                const prStats = ghJson(["api", `repos/${repo}/pulls/${item.number}`]);
                if (prStats) {
                    additions = prStats.additions;
                    deletions = prStats.deletions;
                    changedFiles = prStats.changed_files;

                    // Optionally fetch file names (limit to save API calls)
                    const prFiles = ghJson(["api", `repos/${repo}/pulls/${item.number}/files`]);
                    if (prFiles && Array.isArray(prFiles)) {
                        files = prFiles.map(f => f.filename);
                    }
                }
            }

            // Get comments for unmerged PRs / Issues to check pre-approval
            // Simple stub: just get top 100 comments
            const comments = ghJson(["api", `repos/${repo}/issues/${item.number}/comments`]) || [];
            const reviews = item.wicSourceType === "pull_request" ? ghJson(["api", `repos/${repo}/pulls/${item.number}/reviews`]) || [] : [];

            payload.contributions.push({
                profile,
                number: item.number,
                type: item.wicSourceType,
                title: item.title,
                body: item.body,
                url: item.html_url,
                state: item.state,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                mergedAt: item.pull_request?.merged_at || item.merged_at || null,
                closedAt: item.closed_at,
                stats: {
                    additions,
                    deletions,
                    changedFiles
                },
                filesSummary: files, // Array of file paths
                reviewComments: [...comments, ...reviews].map(r => ({
                    user: r.user?.login,
                    body: r.body,
                    state: r.state // For PR reviews (e.g. APPROVED)
                }))
            });
        }
    }

    // Deduplicate
    const uniqueContributionsMap = new Map();
    payload.contributions.forEach(c => uniqueContributionsMap.set(c.number + c.type, c));
    payload.contributions = Array.from(uniqueContributionsMap.values());

    const uniqueBountiesMap = new Map();
    payload.bounties.forEach(b => uniqueBountiesMap.set(b.number, b));
    payload.bounties = Array.from(uniqueBountiesMap.values());

    if (format === "json") {
        console.log(JSON.stringify(payload, null, 2));
    } else {
        // Markdown format
        console.log(`# WIC Data Payload (${from} to ${to})`);
        console.log(`\n## Active Bounties`);
        payload.bounties.forEach(b => {
            console.log(`- **[#${b.number}] ${b.title}** (State: ${b.closedAt ? "closed" : "open"})`);
            console.log(`  > ${b.body?.substring(0, 200).replace(/\n/g, " ")}...`);
        });

        console.log(`\n## Contributions`);
        payload.contributions.forEach(c => {
            console.log(`### [${c.profile}] ${c.type.toUpperCase()} #${c.number}: ${c.title}`);
            console.log(`- URL: ${c.url}`);
            console.log(`- State: merged=${!!c.mergedAt}, closed=${!!c.closedAt}`);
            console.log(`- Stats: +${c.stats.additions} -${c.stats.deletions} (${c.stats.changedFiles} files)`);
            if (c.filesSummary.length > 0) {
                console.log(`- Files touched (sample): ${c.filesSummary.slice(0, 5).join(", ")}${c.filesSummary.length > 5 ? '...' : ''}`);
            }
            console.log(`\n**Body / Spec Link:** \n${c.body?.substring(0, 500)}...\n`);
        });
    }
}

main();
