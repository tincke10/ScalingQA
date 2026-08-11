<?php

namespace Tests\Feature;

use Tests\TestCase;

// TEMPORAL — verificación de fase 4: este PR DEBE quedar en rojo en GitHub Actions
class CiRedCheckTest extends TestCase
{
    public function test_ci_marks_broken_pr_as_red(): void
    {
        $this->assertTrue(false, 'Rojo a propósito: el PR debe fallar en CI');
    }
}
