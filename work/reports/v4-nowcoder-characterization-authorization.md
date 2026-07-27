```json
{
  "type": "v4-characterization-authorization",
  "schemaVersion": "v4-characterization-authorization-1",
  "date": "2026-07-26",
  "status": "approved",
  "platform": "nowcoder",
  "hostname": "ac.nowcoder.com",
  "pageType": "contest problem",
  "problemSelection": "https://ac.nowcoder.com/acm/contest/18839/1001",
  "userActionOwner": "user",
  "maximumNaturalSubmissions": 1,
  "browseOnlyObservation": true,
  "forbiddenData": [
    "source_code",
    "request_response_bodies",
    "cookies",
    "tokens",
    "csrf_values",
    "passwords",
    "complete_headers",
    "account_identity",
    "full_problem_statements"
  ],
  "retainedFields": [
    "platform",
    "method",
    "normalized_path",
    "resource_type",
    "status_code",
    "normalized_redirect_path",
    "response_top_level_field_names",
    "submission_id_field_name",
    "submission_id_scalar_type",
    "verdict_status_field_name",
    "verdict_status_scalar_type",
    "tab_frame_document_relationship",
    "relative_timing_order",
    "signal_observed_from_real_user_action"
  ],
  "stopConditions": [
    "forbidden_data_displayed_or_persisted",
    "user_withdraws_authorization"
  ]
}
```

# NowCoder Characterization Authorization

The user authorized one browse-only observation of the selected contest problem
and at most one fresh natural submission. The user alone enters and submits
code. Diagnostics retain only the JSON-listed safe transcript metadata and stop
immediately if forbidden data is displayed or persisted, or if authorization is
withdrawn.
