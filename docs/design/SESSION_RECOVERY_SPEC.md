# Session Recovery

Route `/recovery` reconstructs a brief from the local session name, project, latest action, in-progress/blocked tasks, modified Git files, and recent timeline. It labels `actionApplied: false` and does not replay commands.

Future resume actions must be separately confirmed and must revalidate repository and process state first.

© CODINFY PLATFORMS SASU · codinfy.com
