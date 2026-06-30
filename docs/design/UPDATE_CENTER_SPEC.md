# MCP Update Center

Route `/update-center` compares the installed version with GitHub’s latest published release using SemVer. It shows current/latest version, channel, connectivity/error, detected install method, release notes, breaking changes, backup state, preflight checks, and local history.

`autoInstall` is structurally fixed to `false`. Install and rollback require a version, explicit confirmation, a configuration backup, and a passing preflight. The current implementation executes only the supported npm-global method; workspace/Git installations receive a safe manual path.

Approved reference: `concepts/mcp-update-center.png`.

© CODINFY PLATFORMS SASU · codinfy.com
