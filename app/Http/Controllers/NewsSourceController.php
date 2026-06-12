<?php

namespace App\Http\Controllers;

use App\Http\Requests\NewsSourceRequest;
use App\Models\NewsSource;
use Illuminate\Http\Request;

class NewsSourceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        return NewsSource::all();
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(NewsSourceRequest $request)
    {
        return NewsSource::create($request->validated());
    }

    /**
     * Display the specified resource.
     */
    public function show(NewsSource $source)
    {
        return $source;
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(NewsSourceRequest $request, NewsSource $source)
    {
        $source->update($request->validated());

        return $source;
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(NewsSource $source)
    {
        $source->delete();

        return response()->noContent();
    }
}
