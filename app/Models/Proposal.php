<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Proposal extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'title',
        'generatedTitle',
        'summary',
        'generatedSummary',
        'generatedCaption',
        'category',
        'date',
        'captions',
        'template',
        'suggestedTemplate',
        'hashtags',
        'cta',
        'status',
        'source_id',
        'source_name',
        'source_url',
        'metadata',
    ];

    protected $casts = [
        'captions' => 'json',
        'hashtags' => 'json',
        'metadata' => 'json',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }
}
