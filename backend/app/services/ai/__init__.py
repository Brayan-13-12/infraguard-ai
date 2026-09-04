"""AI Assistant backend (v1 - grounded, permission-aware, **read-only**).

```
routes/ai.py
    -> services.ai.orchestrator.run_turn
        -> services.ai.context      (resolve + RBAC-check an asset/incident context)
        -> services.ai.providers    (deterministic | openai, behind an ABC)
             -> services.ai.tools.ToolExecutor   (allow-listed read tools; each
                                                  enforces the domain permission)
                  -> app.services.{assets,incidents,audit}   (existing queries)
        -> services.ai.conversations  (ownership-enforced persistence)
```

No tool mutates anything. No arbitrary SQL, no HTTP fetch, no shell/filesystem.
Authorization is enforced here, at the tool boundary - never only in a prompt or
the frontend.
"""
