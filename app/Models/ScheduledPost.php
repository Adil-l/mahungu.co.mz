<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Builder;

class ScheduledPost extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'flyer_id',
        'content',
        'media_path',
        'platforms',
        'scheduled_at',
        'status',
        'metadata',
        'error_message',
    ];

    protected $casts = [
        'platforms' => 'array',
        'metadata' => 'array',
        'scheduled_at' => 'datetime',
        'error_message' => 'array', // permite salvar/ler erros como array diretamente
    ];

    // Status que não podem mais ser alterados pelo usuário (já processados)
    public const LOCKED_STATUSES = ['posted', 'failed', 'partially_posted'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function flyer()
    {
        return $this->belongsTo(Flyer::class);
    }

    public function metrics()
    {
        return $this->hasMany(PostMetric::class);
    }

    /**
     * Posts pendentes cuja data já passou (prontos para processar).
     */
    public function scopeDueForProcessing(Builder $query): Builder
    {
        return $query->where('status', 'pending')
            ->where('scheduled_at', '<=', now());
    }

    /**
     * Posts pendentes futuros.
     */
    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->where('status', 'pending')
            ->where('scheduled_at', '>', now());
    }

    public function isLocked(): bool
    {
        return in_array($this->status, self::LOCKED_STATUSES, true);
    }
}
