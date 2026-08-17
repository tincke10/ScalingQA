<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * @fixture Tabla demostrativa. La FK a users ejercita joins; el índice compuesto
 * ejercita SQL que debe funcionar igual en MySQL y PostgreSQL. Reemplazar por tu esquema.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->boolean('done')->default(false);
            $table->timestamps();

            $table->index(['user_id', 'done']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
