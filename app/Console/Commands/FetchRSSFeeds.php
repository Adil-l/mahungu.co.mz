<?php

namespace App\Console\Commands;

use App\Models\NewsSource;
use App\Models\Proposal;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use SimpleXMLElement;

class FetchRSSFeeds extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:fetch-rss';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Fetch news from RSS sources and create proposals';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $sources = NewsSource::where('active', true)->get();

        if ($sources->isEmpty()) {
            $this->info("No active news sources found.");
            return;
        }

        foreach ($sources as $source) {
            $this->info("Fetching from: {$source->name} ({$source->url})");
            try {
                // Using a timeout to avoid hanging
                $response = Http::timeout(30)->get($source->url);
                
                if ($response->successful()) {
                    $this->processRss($response->body(), $source);
                } else {
                    $this->error("Failed to fetch {$source->name}: HTTP {$response->status()}");
                }
            } catch (\Exception $e) {
                $this->error("Error fetching {$source->name}: {$e->getMessage()}");
            }
        }

        $this->info("RSS fetch cycle completed.");
    }

    /**
     * Process RSS XML content.
     */
    private function processRss($xmlContent, $source)
    {
        try {
            // Suppress errors for malformed XML
            libxml_use_internal_errors(true);
            $xml = new SimpleXMLElement($xmlContent);
            
            // Handle both RSS and Atom
            $items = [];
            if (isset($xml->channel->item)) {
                $items = $xml->channel->item;
            } elseif (isset($xml->entry)) {
                $items = $xml->entry;
            }

            $newItemsCount = 0;
            foreach ($items as $item) {
                $title = (string) ($item->title ?? '');
                $link = (string) ($item->link ?? ($item->link['href'] ?? ''));
                $description = (string) ($item->description ?? $item->summary ?? $item->content ?? '');
                $pubDate = (string) ($item->pubDate ?? $item->published ?? $item->updated ?? '');

                if (empty($title) || empty($link)) continue;

                // Check if proposal already exists by source_url
                $exists = Proposal::where('source_url', $link)->exists();
                
                if (!$exists) {
                    Proposal::create([
                        'title' => $title,
                        'summary' => trim(strip_tags($description)),
                        'category' => $source->category,
                        'date' => $pubDate ? date('d/m/Y', strtotime($pubDate)) : date('d/m/Y'),
                        'status' => 'new',
                        'source_id' => $source->id,
                        'source_name' => $source->name,
                        'source_url' => $link,
                        'metadata' => ['pub_date' => $pubDate]
                    ]);
                    $newItemsCount++;
                }
            }
            
            $this->info("Created {$newItemsCount} new proposals from {$source->name}");
            $source->update(['last_checked' => now()]);
            
        } catch (\Exception $e) {
            $this->error("Error processing RSS from {$source->name}: {$e->getMessage()}");
        } finally {
            libxml_clear_errors();
        }
    }
}
