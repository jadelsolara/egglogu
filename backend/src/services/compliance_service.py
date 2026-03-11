"""ComplianceService — Certificaciones, inspecciones y tests de salmonella."""

import uuid

from src.models.compliance import (
    ComplianceCertification,
    ComplianceInspection,
    SalmonellaTest,
)
from src.services.base import BaseService


class ComplianceService(BaseService):
    """Operaciones CRUD para el módulo de compliance."""

    # ── Certificaciones ───────────────────────────────────────────────

    async def list_certifications(self, *, page: int = 1, size: int = 50) -> list:
        """Lista certificaciones de la organización."""
        return await self._list(ComplianceCertification, page=page, size=size)

    async def create_certification(self, data) -> ComplianceCertification:
        """Crea una nueva certificación."""
        return await self._create(ComplianceCertification, data)

    async def update_certification(
        self, cert_id: uuid.UUID, data
    ) -> ComplianceCertification:
        """Actualiza una certificación existente."""
        return await self._update(
            ComplianceCertification,
            cert_id,
            data,
            error_msg="Certification not found",
        )

    # ── Inspecciones ──────────────────────────────────────────────────

    async def list_inspections(self, *, page: int = 1, size: int = 50) -> list:
        """Lista inspecciones de la organización."""
        return await self._list(
            ComplianceInspection,
            page=page,
            size=size,
            order_by=ComplianceInspection.scheduled_date.desc(),
        )

    async def create_inspection(self, data) -> ComplianceInspection:
        """Crea una nueva inspección."""
        return await self._create(ComplianceInspection, data)

    async def update_inspection(self, insp_id: uuid.UUID, data) -> ComplianceInspection:
        """Actualiza una inspección existente."""
        return await self._update(
            ComplianceInspection,
            insp_id,
            data,
            error_msg="Inspection not found",
        )

    # ── Tests de salmonella ───────────────────────────────────────────

    async def list_salmonella_tests(self, *, page: int = 1, size: int = 50) -> list:
        """Lista tests de salmonella de la organización."""
        return await self._list(
            SalmonellaTest,
            page=page,
            size=size,
            order_by=SalmonellaTest.sample_date.desc(),
        )

    async def create_salmonella_test(self, data) -> SalmonellaTest:
        """Crea un nuevo test de salmonella."""
        return await self._create(SalmonellaTest, data)

    async def update_salmonella_test(self, test_id: uuid.UUID, data) -> SalmonellaTest:
        """Actualiza un test de salmonella existente."""
        return await self._update(
            SalmonellaTest,
            test_id,
            data,
            error_msg="Salmonella test not found",
        )
