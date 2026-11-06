# Security Policy

## Supported Versions

This is a personal open-source project. Only the latest commit on the `main`
branch receives security fixes. There are no maintained release branches.

| Version | Supported |
| ------- | --------- |
| `main` (latest) | Yes |
| Older commits | No |

## Reporting a Vulnerability

If you find a security vulnerability, please report it by
[opening a GitHub issue](https://github.com/mrpythonist/webhook-delivery-platform/issues)
and labelling it as a security concern, or through the contact options at
https://mrpythonist.com.

Do not include exploit code that would harm a running deployment, and do not
test vulnerabilities against systems you do not own.

Please include, where you can:

- A description of the vulnerability and what it affects
- Steps to reproduce it
- The impact you think it has
- Any suggested fix, if you have one

Reports are reviewed as time allows. There is no paid bug bounty program.

## Known Limitations (Not Vulnerabilities)

The following are documented design limits of this project, not hidden flaws.
They are listed in the README under "Limitations" and are out of scope for
security reports unless you can show a new impact beyond what is documented:

- The API has no authentication or authorization. Do not expose it to the
  public internet as-is.
- Endpoint signing secrets are stored as plaintext in PostgreSQL. A production
  system should encrypt them at rest.
- There is no rate limiting on event publishing and no TLS termination in the
  project itself. Put a reverse proxy and rate limits in front of it.
- The demo receiver's flaky hit counter is in-memory and resets on restart.
- Delivery payloads are capped at 1 MB and stored response bodies are
  truncated to 4 KB per attempt.

## Scope

This policy covers the code in this repository only. It does not cover
third-party services, hosting providers, or deployments run by other people.
