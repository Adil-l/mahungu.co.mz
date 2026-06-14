<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PostMetric extends Model
{
    protected $fillable = [
        'scheduled_post_id', 'platform', 'platform_post_id',
        'likes', 'comments', 'shares', 'saved', 'reach', 'impressions', 'fetched_at',
    ];

    protected $casts = [
        'fetched_at' => 'datetime',
    ];

    public function scheduledPost(): BelongsTo
    {
        return $this->belongsTo(ScheduledPost::class);
    }
}
