{{/*
EGGlogU Helm Chart — Template Helpers
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "egglogu.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "egglogu.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "egglogu.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "egglogu.labels" -}}
helm.sh/chart: {{ include "egglogu.chart" . }}
{{ include "egglogu.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "egglogu.selectorLabels" -}}
app.kubernetes.io/name: {{ include "egglogu.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component-specific labels
*/}}
{{- define "egglogu.componentLabels" -}}
{{ include "egglogu.labels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Component-specific selector labels
*/}}
{{- define "egglogu.componentSelectorLabels" -}}
{{ include "egglogu.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
PostgreSQL primary service name
*/}}
{{- define "egglogu.postgres.primary" -}}
{{- printf "%s-postgres-primary" (include "egglogu.fullname" .) }}
{{- end }}

{{/*
PostgreSQL replica service name
*/}}
{{- define "egglogu.postgres.replica" -}}
{{- printf "%s-postgres-replica" (include "egglogu.fullname" .) }}
{{- end }}

{{/*
Redis master service name
*/}}
{{- define "egglogu.redis.master" -}}
{{- printf "%s-redis-master" (include "egglogu.fullname" .) }}
{{- end }}

{{/*
Redis sentinel service name
*/}}
{{- define "egglogu.redis.sentinel" -}}
{{- printf "%s-redis-sentinel" (include "egglogu.fullname" .) }}
{{- end }}

{{/*
PgBouncer connection string (used inside app pod sidecar → localhost)
*/}}
{{- define "egglogu.pgbouncer.dsn" -}}
postgresql+asyncpg://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@127.0.0.1:6432/$(POSTGRES_DB)
{{- end }}

{{/*
Secret name
*/}}
{{- define "egglogu.secretName" -}}
{{- printf "%s-secrets" (include "egglogu.fullname" .) }}
{{- end }}

{{/*
ConfigMap name
*/}}
{{- define "egglogu.configmapName" -}}
{{- printf "%s-config" (include "egglogu.fullname" .) }}
{{- end }}
